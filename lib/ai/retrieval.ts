import { Prisma } from "@prisma/client";
import { embedChunks, toVectorLiteral } from "@/lib/ai/embeddings";
import { indexMaterialChunksSafely } from "@/lib/ai/material-indexing";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Phase 2 of RAG: the single retrieval service every AI feature uses to find
 * relevant study material.
 *
 * This exists to replace truncation. Before it, each feature took
 * `Material.extractedText`, sliced the first 12k–16k characters and sent that —
 * which is both wasteful (most of it is irrelevant to the question asked) and
 * quietly wrong (everything past the cut simply did not exist as far as the
 * model was concerned; a fact on page 40 was unreachable). Retrieval sends the
 * handful of passages that actually match, from anywhere in the document.
 *
 * Everything here is org-scoped at the SQL level. Retrieval reads across
 * materials, so a missing tenant filter would leak one organization's notes into
 * another's tutor answers — the filter is not optional and not caller-supplied.
 */

/** Passages per query. Enough to answer from, small enough to stay cheap. */
export const DEFAULT_TOP_K = 6;

/**
 * Cosine similarity below which a passage is treated as unrelated.
 *
 * text-embedding-3-small puts genuinely relevant course prose around 0.3–0.6
 * against a natural-language question, while unrelated text from the same
 * document still scores ~0.1–0.2 (embeddings are never orthogonal in practice).
 * 0.25 keeps the near misses that often carry the answer and drops the noise.
 * It matters most for the tutor: "no chunk cleared the bar" is what makes an
 * honest "your material does not cover this" possible, so the bar must not be
 * so high that real matches fall under it.
 */
export const MIN_SIMILARITY = 0.25;

/** Hard ceiling on assembled context, so a prompt can never grow unbounded. */
const MAX_CONTEXT_CHARS = 24_000;

export type RetrievedChunk = {
	id: string;
	materialId: string;
	materialTitle: string;
	chunkIndex: number;
	chunkText: string;
	heading: string | null;
	pageNumber: number | null;
	similarity: number;
};

type Scope = {
	organizationId: string;
	courseId?: string | null;
	materialIds?: string[] | null;
};

/**
 * Index any material in scope that has text but no chunks yet.
 *
 * Materials uploaded before Phase 1 have no embeddings, and features that now
 * retrieve instead of truncating would silently see nothing for them — the
 * content is still there, just invisible. Rather than ship a migration everyone
 * must remember to run, retrieval heals its own scope on first use.
 *
 * Cheap in the normal case: one grouped count, and no work at all once indexed.
 * Reuses the Phase 1 indexer rather than reimplementing it, so chunk boundaries
 * and embedding model can never drift between the two paths.
 */
export async function ensureMaterialsIndexed(scope: Scope): Promise<number> {
	const { organizationId, courseId, materialIds } = scope;

	const candidates = await prisma.material.findMany({
		where: {
			organizationId,
			...(courseId ? { courseId } : {}),
			...(materialIds?.length ? { id: { in: materialIds } } : {}),
			extractedText: { not: null },
			chunks: { none: {} },
		},
		select: { id: true, extractedText: true },
		take: 20,
	});

	if (candidates.length === 0) return 0;

	logger.info(
		{ organizationId, courseId, count: candidates.length },
		"Backfilling chunks for materials indexed before retrieval existed",
	);

	let indexed = 0;
	for (const material of candidates) {
		const result = await indexMaterialChunksSafely({
			materialId: material.id,
			organizationId,
			text: material.extractedText,
		});
		if (result && !result.skipped) indexed++;
	}
	return indexed;
}

/**
 * Find the passages most semantically similar to `query`, newest-model cosine
 * distance, restricted to the caller's organization.
 *
 * Returns [] when nothing clears MIN_SIMILARITY — an empty result is a real
 * answer ("the material does not cover this"), not an error. Callers decide
 * what to do with it; the tutor says so out loud, generators fall back to
 * teaching from the topic title.
 */
export async function retrieveChunks(
	params: Scope & {
		query: string;
		topK?: number;
		minSimilarity?: number;
	},
): Promise<RetrievedChunk[]> {
	const {
		organizationId,
		courseId,
		materialIds,
		query,
		topK = DEFAULT_TOP_K,
		minSimilarity = MIN_SIMILARITY,
	} = params;

	const trimmed = query.trim();
	if (!trimmed) return [];

	await ensureMaterialsIndexed({ organizationId, courseId, materialIds });

	// Reuses the Phase 1 embedder, so a query and the chunks it searches are
	// always embedded by the same model — vectors from two models are not
	// comparable and would return confident nonsense.
	const [embedding] = await embedChunks([trimmed.slice(0, 8_000)]);
	if (!embedding) return [];
	const vector = toVectorLiteral(embedding);

	// The org filter leads and is never caller-optional; course/material only
	// narrow it further. Built as parameterised fragments so the scope cannot be
	// string-interpolated into the query.
	const filters: Prisma.Sql[] = [
		Prisma.sql`c.organization_id = ${organizationId}::uuid`,
	];
	if (courseId) {
		filters.push(Prisma.sql`m.course_id = ${courseId}::uuid`);
	}
	if (materialIds?.length) {
		filters.push(
			Prisma.sql`c.material_id IN (${Prisma.join(
				materialIds.map((id) => Prisma.sql`${id}::uuid`),
			)})`,
		);
	}
	const where = Prisma.join(filters, " AND ");

	const rows = await prisma.$queryRaw<
		{
			id: string;
			material_id: string;
			material_title: string;
			chunk_index: number;
			chunk_text: string;
			heading: string | null;
			page_number: number | null;
			similarity: number;
		}[]
	>`
		SELECT c.id,
		       c.material_id,
		       m.title AS material_title,
		       c.chunk_index,
		       c.chunk_text,
		       c.heading,
		       c.page_number,
		       1 - (c.embedding <=> ${vector}::vector) AS similarity
		  FROM "material_chunk" c
		  JOIN "material" m ON m.id = c.material_id
		 WHERE ${where}
		 ORDER BY c.embedding <=> ${vector}::vector
		 LIMIT ${topK}
	`;

	return rows
		.map((row) => ({
			id: row.id,
			materialId: row.material_id,
			materialTitle: row.material_title,
			chunkIndex: row.chunk_index,
			chunkText: row.chunk_text,
			heading: row.heading,
			pageNumber: row.page_number,
			similarity: Number(row.similarity),
		}))
		.filter((chunk) => chunk.similarity >= minSimilarity);
}

/**
 * Render retrieved passages as a labelled context block for a prompt.
 *
 * Each passage is attributed to its material (and heading when known) so the
 * model can cite where something came from, and so a human reading the prompt
 * in a log can tell retrieval apart from invention.
 */
export function buildContextBlock(
	chunks: RetrievedChunk[],
	maxChars = MAX_CONTEXT_CHARS,
): string {
	if (chunks.length === 0) return "";

	const label = (chunk: RetrievedChunk) =>
		chunk.heading
			? `[Source: ${chunk.materialTitle} — ${chunk.heading}]`
			: `[Source: ${chunk.materialTitle}]`;

	const parts: string[] = [];
	let used = 0;
	for (const chunk of chunks) {
		const block = `${label(chunk)}\n${chunk.chunkText}`;
		if (used + block.length > maxChars) break;
		parts.push(block);
		used += block.length;
	}

	// A chunk is a thousand-odd tokens, so a caller with a budget smaller than
	// one chunk would otherwise get "" — silently ungrounded, and indistinguish-
	// able from "the material has nothing on this". The best passage truncated is
	// worth far more than nothing at all, so keep its head rather than drop it.
	if (parts.length === 0) {
		const best = chunks[0];
		if (!best) return "";
		const head = `${label(best)}\n`;
		const room = maxChars - head.length;
		if (room <= 0) return "";
		return `${head}${best.chunkText.slice(0, room)}`;
	}

	return parts.join("\n\n---\n\n");
}

/**
 * Retrieve and format in one step — the shape most callers want.
 *
 * `maxChars` matters when a caller retrieves per topic in a loop: six topics
 * each taking the full default budget would rebuild the very wall of text this
 * phase exists to remove.
 */
export async function retrieveContext(
	params: Scope & {
		query: string;
		topK?: number;
		minSimilarity?: number;
		maxChars?: number;
	},
): Promise<{ context: string; chunks: RetrievedChunk[] }> {
	const chunks = await retrieveChunks(params);
	return { context: buildContextBlock(chunks, params.maxChars), chunks };
}

/**
 * Select chunks that represent a whole material, in document order.
 *
 * Topic segmentation is the one job similarity search cannot do: "split this
 * document into its topics" has no query to match against — the target *is* the
 * whole document. Retrieving the top-K for some invented query would bias
 * segmentation toward whatever that query happened to mean.
 *
 * So this does the other useful thing. The old code took the first 16k
 * characters, which meant a long document's later half was never segmented at
 * all — its topics simply did not exist. This walks the chunk list at a stride
 * and takes an even spread across the entire document, so segmentation sees the
 * beginning, middle and end within the same budget. Still not the whole
 * document, and never more than `maxChars` reaches the model.
 */
export async function selectCoverageChunks(params: {
	organizationId: string;
	materialId: string;
	maxChars?: number;
}): Promise<{ text: string; chunkCount: number; sampled: boolean }> {
	const { organizationId, materialId, maxChars = 16_000 } = params;

	await ensureMaterialsIndexed({ organizationId, materialIds: [materialId] });

	const chunks = await prisma.materialChunk.findMany({
		where: { organizationId, materialId },
		select: { chunkText: true, heading: true },
		orderBy: { chunkIndex: "asc" },
	});
	if (chunks.length === 0) return { text: "", chunkCount: 0, sampled: false };

	const render = (c: (typeof chunks)[number]) =>
		c.heading ? `## ${c.heading}\n${c.chunkText}` : c.chunkText;

	const total = chunks.reduce((sum, c) => sum + render(c).length + 4, 0);
	if (total <= maxChars) {
		return {
			text: chunks.map(render).join("\n\n"),
			chunkCount: chunks.length,
			sampled: false,
		};
	}

	// Too big to send whole: take an even stride so coverage spans the document
	// rather than stopping at an arbitrary cut-off.
	const budgetPerChunk = Math.max(1, Math.floor(maxChars / chunks.length));
	const keep = Math.max(1, Math.floor(maxChars / Math.max(budgetPerChunk, 1)));
	const stride = Math.max(1, Math.ceil(chunks.length / keep));

	const picked: string[] = [];
	let used = 0;
	for (let i = 0; i < chunks.length; i += stride) {
		const chunk = chunks[i];
		if (!chunk) continue;
		const block = render(chunk);
		if (used + block.length > maxChars) break;
		picked.push(block);
		used += block.length;
	}

	return {
		text: picked.join("\n\n"),
		chunkCount: picked.length,
		sampled: true,
	};
}
