import { Prisma } from "@prisma/client";
import { chunkText } from "@/lib/ai/chunking";
import { embedChunks, toVectorLiteral } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * The write side of RAG: turn a Material's extracted text into embedded chunks.
 * lib/ai/retrieval.ts is the read side; this module only builds the index.
 *
 * Material.extractedText stays exactly as it was and remains the source of
 * truth — chunks are derived data and can always be rebuilt from it.
 */

/**
 * Rows written per INSERT. Each row carries 1536 floats (~20 KB as text), so
 * batching bounds both statement size and the driver's parameter count.
 */
const INSERT_BATCH_SIZE = 50;

/**
 * Refuse to index absurdly large text rather than spend real money discovering
 * it. 500k chars is the Material ceiling enforced by the schemas, which is
 * ~125k tokens — about $0.0025 to embed. The guard exists so a future ceiling
 * change can't quietly turn into a large bill.
 */
const MAX_INDEXABLE_CHARS = 500_000;

export type IndexResult = {
	chunksCreated: number;
	skipped: boolean;
	reason?: string;
};

/**
 * Chunk, embed, and store a material's text, replacing any chunks it already
 * has.
 *
 * Replace-all rather than diff: chunk boundaries shift when the text changes,
 * so a "changed" chunk usually isn't identifiable as the same chunk at all.
 * This mirrors how segmentTopics re-segments — re-running is idempotent.
 *
 * Embeddings are generated once here, at index time, and never per query.
 */
export async function indexMaterialChunks({
	materialId,
	organizationId,
	text,
}: {
	materialId: string;
	organizationId: string;
	text: string | null | undefined;
}): Promise<IndexResult> {
	const source = text?.trim();

	// No text is a legitimate state (a link, or a PDF still awaiting
	// extraction). Clear any stale chunks and stop.
	if (!source) {
		await prisma.materialChunk.deleteMany({
			where: { materialId, organizationId },
		});
		return { chunksCreated: 0, skipped: true, reason: "no_text" };
	}

	if (source.length > MAX_INDEXABLE_CHARS) {
		return { chunksCreated: 0, skipped: true, reason: "too_large" };
	}

	const chunks = chunkText(source);
	if (chunks.length === 0)
		return { chunksCreated: 0, skipped: true, reason: "no_chunks" };

	// Embed before touching the database: if OpenAI fails, the existing chunks
	// are still intact and still retrievable, which is strictly better than
	// deleting them and failing to write replacements.
	const embeddings = await embedChunks(chunks.map((c) => c.chunkText));

	const rows = chunks.map((chunk, i) => {
		const embedding = embeddings[i];
		if (!embedding) throw new Error(`Missing embedding for chunk ${i}`);
		return { ...chunk, vector: toVectorLiteral(embedding) };
	});

	await prisma.$transaction(async (tx) => {
		await tx.materialChunk.deleteMany({
			where: { materialId, organizationId },
		});

		for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
			const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
			// Raw SQL because Prisma Client cannot write Unsupported("vector")
			// columns. Values are parameterised by Prisma.sql — the vector is a
			// bound parameter cast with ::vector, never string-interpolated.
			const values = batch.map(
				(row) => Prisma.sql`(
					${organizationId}::uuid,
					${materialId}::uuid,
					${row.chunkIndex},
					${row.chunkText},
					${row.vector}::vector,
					${row.pageNumber},
					${row.heading}
				)`,
			);

			await tx.$executeRaw`
				INSERT INTO "material_chunk" (
					"organization_id", "material_id", "chunk_index",
					"chunk_text", "embedding", "page_number", "heading"
				)
				VALUES ${Prisma.join(values)}
			`;
		}
	});

	return { chunksCreated: rows.length, skipped: false };
}

/**
 * Index a material without letting a failure take the caller down with it.
 *
 * Indexing is a background concern bolted onto material create/update: the
 * user's actual request (save my notes) has already succeeded by the time this
 * runs, and no feature reads chunks yet. Throwing here would turn an OpenAI
 * hiccup into a failed upload and lose the user's text — a strictly worse
 * outcome than a material that is momentarily unindexed. The failure is logged
 * and the material stays re-indexable.
 */
export async function indexMaterialChunksSafely(args: {
	materialId: string;
	organizationId: string;
	text: string | null | undefined;
}): Promise<IndexResult | null> {
	try {
		const result = await indexMaterialChunks(args);
		logger.info(
			{
				materialId: args.materialId,
				organizationId: args.organizationId,
				chunksCreated: result.chunksCreated,
				skipped: result.skipped,
				reason: result.reason,
			},
			"Indexed material chunks",
		);
		return result;
	} catch (error) {
		logger.error(
			{
				error,
				materialId: args.materialId,
				organizationId: args.organizationId,
			},
			"Failed to index material chunks; material text is saved and can be re-indexed",
		);
		return null;
	}
}
