import { indexMaterialChunks } from "@/lib/ai/material-indexing";
import { prisma } from "@/lib/db";

/**
 * One-time backfill: give every Material that still has none the chunks and
 * embeddings a new upload would have produced.
 *
 * Materials created before retrieval existed have text but no chunks, so the AI
 * features cannot see them — the content is there, just unreachable. Retrieval
 * heals its own scope lazily (see ensureMaterialsIndexed), but only for the
 * course being queried and only 20 at a time; this walks the whole database in
 * one go so nothing waits to be stumbled upon.
 *
 * Run:  pnpm backfill-materials
 *
 * Safe to re-run: it selects only materials with no chunks, so an indexed one is
 * never touched or paid for twice. It generates nothing itself — chunking and
 * embedding both come from indexMaterialChunks, the same function material.create
 * calls, so a backfilled material is byte-for-byte what a fresh upload produces.
 */

/** Page size for the id scan. Text is fetched per material, never all at once. */
const PAGE_SIZE = 50;

type Totals = { processed: number; skipped: number; failed: number };

function line(totals: Totals, total: number) {
	const done = totals.processed + totals.skipped + totals.failed;
	return `[${done}/${total}] processed=${totals.processed} skipped=${totals.skipped} failed=${totals.failed}`;
}

async function main() {
	const totals: Totals = { processed: 0, skipped: 0, failed: 0 };

	// Only materials that have text AND no chunks. This predicate is the whole
	// idempotency story: a second run simply finds nothing.
	const where = {
		extractedText: { not: null },
		chunks: { none: {} },
	} as const;

	const total = await prisma.material.count({ where });

	if (total === 0) {
		console.log("Nothing to backfill: every material with text is indexed.");
		return;
	}

	console.log(`Backfilling ${total} material(s) without chunks…`);

	// Cursor rather than skip/take: rows leave the result set as they are
	// indexed, so an offset would walk past unprocessed materials.
	let cursor: string | undefined;
	for (;;) {
		const batch = await prisma.material.findMany({
			where,
			select: { id: true, title: true, organizationId: true },
			orderBy: { id: "asc" },
			take: PAGE_SIZE,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
		});
		if (batch.length === 0) break;
		cursor = batch.at(-1)?.id;

		for (const material of batch) {
			// Fetched per material so one enormous document cannot blow up memory
			// for the whole batch.
			const row = await prisma.material.findUnique({
				where: { id: material.id },
				select: { extractedText: true },
			});

			try {
				const result = await indexMaterialChunks({
					materialId: material.id,
					organizationId: material.organizationId,
					text: row?.extractedText,
				});

				if (result.skipped) {
					totals.skipped++;
					console.log(
						`  skip  ${material.title} (${result.reason ?? "nothing to index"})`,
					);
				} else {
					totals.processed++;
					console.log(
						`  ok    ${material.title} — ${result.chunksCreated} chunk(s)`,
					);
				}
			} catch (error) {
				// One bad material must not end the run: the remaining ones are
				// still worth indexing, and the failure is named so it can be
				// retried by simply running the command again.
				totals.failed++;
				console.error(
					`  FAIL  ${material.title} (${material.id}): ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
			console.log(`        ${line(totals, total)}`);
		}
	}

	console.log(
		`\nDone. processed=${totals.processed} skipped=${totals.skipped} failed=${totals.failed}`,
	);

	// A failure is reported in the summary and surfaced in the exit code, so CI
	// or an operator does not read a partial run as a clean one.
	if (totals.failed > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error("Backfill aborted:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
