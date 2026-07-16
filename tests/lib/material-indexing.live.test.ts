import { describe, expect, it } from "vitest";
import { indexMaterialChunks } from "@/lib/ai/material-indexing";
import { prisma } from "@/lib/db";

/**
 * Live round-trip for RAG Phase 1: real Postgres with pgvector, real OpenAI
 * embeddings. Guarded behind VERIFY_RAG=true (the same pattern as the SEED_DB
 * seed test) because it costs money and needs a running database, so it must
 * never fire during the normal suite.
 *
 * Run it with:
 *   $env:VERIFY_RAG="true"; npm run with-dev-env -- vitest run tests/lib/material-indexing.live.test.ts
 *
 * The chunking rules themselves are covered by chunking.test.ts. What only a
 * live run can show is the part with no unit-test equivalent: that a vector(1536)
 * survives the driver intact, that re-indexing replaces rather than accumulates,
 * and that the cascade cleans up.
 *
 * Deliberately one test rather than five. The steps share a single material and
 * must run in order, and this suite runs tests concurrently by default — which
 * both breaks that ordering and races the single Prisma WASM query compiler.
 */

const SAMPLE = [
	"# Symmetric Encryption",
	"Symmetric encryption uses a single shared secret key for both encryption and decryption. ".repeat(
		40,
	),
	"The Advanced Encryption Standard operates on 128-bit blocks with keys of 128, 192, or 256 bits. ".repeat(
		40,
	),
	"## Public Key Infrastructure",
	"Asymmetric cryptography uses a keypair: a public key that may be freely distributed and a private key that must stay secret. ".repeat(
		40,
	),
].join("\n\n");

describe.runIf(process.env.VERIFY_RAG === "true")(
	"indexMaterialChunks (live)",
	() => {
		it(
			"chunks, embeds, stores, re-indexes, and cascades",
			async () => {
				const org = await prisma.organization.findFirstOrThrow();
				const course = await prisma.course.create({
					data: { organizationId: org.id, title: "RAG Phase 1 Verification" },
				});
				const material = await prisma.material.create({
					data: {
						organizationId: org.id,
						courseId: course.id,
						title: "Cryptography Notes",
						extractedText: SAMPLE,
						status: "ready",
					},
				});

				try {
					// --- index -------------------------------------------------
					const result = await indexMaterialChunks({
						materialId: material.id,
						organizationId: org.id,
						text: SAMPLE,
					});
					expect(result.skipped).toBe(false);
					expect(result.chunksCreated).toBeGreaterThan(1);

					// --- vectors are real vector(1536)s, not lookalike strings ---
					const rows = await prisma.$queryRaw<
						{ dims: number; norm: number; heading: string | null }[]
					>`SELECT vector_dims(embedding) AS dims,
					         vector_norm(embedding) AS norm,
					         heading
					    FROM material_chunk WHERE material_id = ${material.id}::uuid
					   ORDER BY chunk_index`;

					expect(rows).toHaveLength(result.chunksCreated);
					for (const row of rows) {
						expect(row.dims).toBe(1536);
						// OpenAI returns unit-normalised embeddings; a zero norm would
						// mean an empty or corrupted vector got stored.
						expect(Number(row.norm)).toBeGreaterThan(0.9);
					}
					expect(rows.some((r) => r.heading === "Symmetric Encryption")).toBe(
						true,
					);

					// --- extractedText is untouched (compatibility requirement) ---
					const after = await prisma.material.findUniqueOrThrow({
						where: { id: material.id },
						select: { extractedText: true },
					});
					expect(after.extractedText).toBe(SAMPLE);

					// --- similarity search works over what we stored -------------
					const hits = await prisma.$queryRaw<
						{ chunk_index: number; distance: number }[]
					>`SELECT chunk_index,
					         (embedding <=> (SELECT embedding FROM material_chunk
					                          WHERE material_id = ${material.id}::uuid
					                            AND chunk_index = 0)) AS distance
					    FROM material_chunk WHERE material_id = ${material.id}::uuid
					   ORDER BY distance LIMIT 3`;
					// Chunk 0's nearest neighbour is itself, at distance zero.
					expect(hits[0]?.chunk_index).toBe(0);
					expect(Number(hits[0]?.distance)).toBeCloseTo(0, 5);

					// --- re-index replaces, never accumulates --------------------
					const again = await indexMaterialChunks({
						materialId: material.id,
						organizationId: org.id,
						text: SAMPLE,
					});
					expect(again.chunksCreated).toBe(result.chunksCreated);
					expect(
						await prisma.materialChunk.count({
							where: { materialId: material.id },
						}),
					).toBe(result.chunksCreated);

					// --- clearing the text clears the chunks ---------------------
					const cleared = await indexMaterialChunks({
						materialId: material.id,
						organizationId: org.id,
						text: null,
					});
					expect(cleared).toMatchObject({ skipped: true, reason: "no_text" });
					expect(
						await prisma.materialChunk.count({
							where: { materialId: material.id },
						}),
					).toBe(0);

					// --- deleting the material cascades to its chunks ------------
					await indexMaterialChunks({
						materialId: material.id,
						organizationId: org.id,
						text: "A short note about certificate authorities and trust chains.",
					});
					expect(
						await prisma.materialChunk.count({
							where: { materialId: material.id },
						}),
					).toBeGreaterThan(0);

					await prisma.material.delete({ where: { id: material.id } });
					expect(
						await prisma.materialChunk.count({
							where: { materialId: material.id },
						}),
					).toBe(0);
				} finally {
					await prisma.material.deleteMany({ where: { id: material.id } });
					await prisma.course.deleteMany({ where: { id: course.id } });
				}
			},
			180_000,
		);
	},
);
