import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

/**
 * Embedding configuration for material indexing.
 *
 * Separate from lib/ai/tutor.ts on purpose: that module resolves *chat/
 * generation* models and its DEFAULT_CHAT_MODEL is user-selectable. The
 * embedding model is not a preference — it is part of the storage format. Every
 * vector in material_chunk must come from the same model, because vectors from
 * two different models are not comparable and mixing them silently corrupts
 * retrieval. Changing EMBEDDING_MODEL therefore means re-indexing everything.
 */

/**
 * text-embedding-3-small: 1536 dimensions, matching vector(1536) in the schema.
 * Chosen over -3-large (3072 dims) because large costs ~6.5x more and doubles
 * storage for a few points of benchmark accuracy that a course-notes corpus of
 * this size will never notice.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Must equal the vector(N) dimension in prisma/schema.prisma. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * OpenAI accepts many inputs per request; batching keeps us clear of the
 * per-request token ceiling while limiting concurrent requests so a large
 * material can't trip rate limits on its own.
 */
const MAX_PARALLEL_CALLS = 3;

/**
 * Embed a batch of chunk texts, returning one vector per input in input order.
 *
 * Order matters: callers zip the result straight back onto their chunks, so a
 * reordered response would attach every vector to the wrong text. embedMany
 * guarantees index correspondence, hence the length assertion below rather than
 * a lookup by content.
 */
export async function embedChunks(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];

	const { embeddings } = await embedMany({
		model: openai.embedding(EMBEDDING_MODEL),
		values: texts,
		maxParallelCalls: MAX_PARALLEL_CALLS,
	});

	if (embeddings.length !== texts.length) {
		throw new Error(
			`Embedding count mismatch: expected ${texts.length}, received ${embeddings.length}`,
		);
	}

	const wrongSize = embeddings.find((e) => e.length !== EMBEDDING_DIMENSIONS);
	if (wrongSize) {
		// Would otherwise surface as an opaque Postgres error on INSERT.
		throw new Error(
			`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, received ${wrongSize.length}. EMBEDDING_MODEL and the vector(N) column have diverged.`,
		);
	}

	return embeddings;
}

/**
 * Render a vector in pgvector's text input format: `[0.1,0.2,...]`.
 *
 * pgvector has no binary protocol via the Postgres driver here, so the literal
 * is passed as a parameter and cast with `::vector` at the call site. Numbers
 * are interpolated only after being checked as finite, so nothing but digits
 * can reach the string.
 */
export function toVectorLiteral(embedding: number[]): string {
	if (embedding.length !== EMBEDDING_DIMENSIONS) {
		throw new Error(
			`Expected ${EMBEDDING_DIMENSIONS} dimensions, received ${embedding.length}`,
		);
	}
	for (const value of embedding) {
		if (!Number.isFinite(value)) {
			throw new Error("Embedding contains a non-finite value");
		}
	}
	return `[${embedding.join(",")}]`;
}
