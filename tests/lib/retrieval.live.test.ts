import { describe, expect, it } from "vitest";
import { indexMaterialChunks } from "@/lib/ai/material-indexing";
import {
	buildContextBlock,
	retrieveChunks,
	retrieveContext,
	selectCoverageChunks,
} from "@/lib/ai/retrieval";
import { prisma } from "@/lib/db";

/**
 * Live checks for the Phase 2 retrieval service: real pgvector, real OpenAI
 * embeddings. Guarded behind VERIFY_RAG=true — costs money, needs a database.
 *
 * Run it with:
 *   $env:VERIFY_RAG="true"; npm run with-dev-env -- vitest run tests/lib/retrieval.live.test.ts
 *
 * One test, sequentially: the suite runs tests concurrently by default, which
 * both races the single Prisma WASM query compiler and breaks the shared-fixture
 * ordering these steps rely on.
 */

// Three clearly separated subjects, so "did retrieval find the RIGHT passage"
// is answerable rather than a coin flip between near-identical paragraphs.
const PHOTOSYNTHESIS = [
	"# Photosynthesis",
	"Photosynthesis converts light energy into chemical energy stored as glucose. It occurs in the chloroplasts of plant cells. ".repeat(
		12,
	),
	"The light-dependent reactions take place in the thylakoid membrane and produce ATP and NADPH. ".repeat(
		12,
	),
].join("\n\n");

const MITOSIS = [
	"# Mitosis",
	"Mitosis is the division of a somatic cell nucleus into two genetically identical daughter nuclei. ".repeat(
		12,
	),
	"Prophase, metaphase, anaphase and telophase are the four stages of mitosis, followed by cytokinesis. ".repeat(
		12,
	),
].join("\n\n");

describe.runIf(process.env.VERIFY_RAG === "true")("retrieval (live)", () => {
	it("retrieves the matching passage, scopes by tenant, and reports honest misses", async () => {
		const org = await prisma.organization.findFirstOrThrow();
		const course = await prisma.course.create({
			data: { organizationId: org.id, title: "RAG Phase 2 Verification" },
		});

		const otherOrg = await prisma.organization.create({
			data: { name: "RAG Isolation Org", slug: "rag-isolation-org-p2" },
		});
		const otherCourse = await prisma.course.create({
			data: { organizationId: otherOrg.id, title: "Other Org Course" },
		});

		const mk = async (
			organizationId: string,
			courseId: string,
			title: string,
			text: string,
		) => {
			const m = await prisma.material.create({
				data: {
					organizationId,
					courseId,
					title,
					extractedText: text,
					status: "ready",
				},
			});
			await indexMaterialChunks({
				materialId: m.id,
				organizationId,
				text,
			});
			return m;
		};

		const photo = await mk(org.id, course.id, "Photosynthesis", PHOTOSYNTHESIS);
		await mk(org.id, course.id, "Mitosis", MITOSIS);
		// Same content, different tenant: the isolation check has teeth only if
		// the other org holds text that WOULD match the query.
		await mk(
			otherOrg.id,
			otherCourse.id,
			"Secret Photosynthesis",
			PHOTOSYNTHESIS,
		);

		try {
			// --- retrieves the right document, not just any document ---------
			const hits = await retrieveChunks({
				organizationId: org.id,
				courseId: course.id,
				query: "Which stages make up cell division?",
				topK: 3,
			});
			expect(hits.length).toBeGreaterThan(0);
			expect(hits[0]?.materialTitle).toBe("Mitosis");
			// Ranked by similarity, descending.
			const sims = hits.map((h) => h.similarity);
			expect([...sims].sort((a, b) => b - a)).toEqual(sims);

			const photoHits = await retrieveChunks({
				organizationId: org.id,
				courseId: course.id,
				query: "How do plants turn sunlight into sugar?",
				topK: 3,
			});
			expect(photoHits[0]?.materialTitle).toBe("Photosynthesis");

			// --- tenant isolation: never another org's material --------------
			const leaked = hits
				.concat(photoHits)
				.some((h) => h.materialTitle.includes("Secret"));
			expect(leaked).toBe(false);

			// --- an honest miss returns nothing, rather than a bad guess ------
			const miss = await retrieveChunks({
				organizationId: org.id,
				courseId: course.id,
				query:
					"What were the terms of the Treaty of Westphalia and its effect on sovereignty?",
				topK: 3,
			});
			expect(miss).toHaveLength(0);

			// --- material scoping ---------------------------------------------
			const scoped = await retrieveChunks({
				organizationId: org.id,
				materialIds: [photo.id],
				query: "cell division stages",
				topK: 5,
			});
			expect(scoped.every((h) => h.materialId === photo.id)).toBe(true);

			// --- context block is bounded and attributed ----------------------
			const { context } = await retrieveContext({
				organizationId: org.id,
				courseId: course.id,
				query: "How do plants turn sunlight into sugar?",
				topK: 6,
				maxChars: 1_200,
			});
			expect(context.length).toBeLessThanOrEqual(1_200);
			expect(context).toContain("[Source: Photosynthesis");
			// Crucially: not the whole document.
			expect(context.length).toBeLessThan(PHOTOSYNTHESIS.length);

			// --- coverage spans the document for segmentation ------------------
			const coverage = await selectCoverageChunks({
				organizationId: org.id,
				materialId: photo.id,
				maxChars: 100_000,
			});
			expect(coverage.chunkCount).toBeGreaterThan(0);
			expect(coverage.sampled).toBe(false);
			expect(coverage.text).toContain("Photosynthesis");

			const tight = await selectCoverageChunks({
				organizationId: org.id,
				materialId: photo.id,
				maxChars: 800,
			});
			expect(tight.text.length).toBeLessThanOrEqual(800);
		} finally {
			await prisma.material.deleteMany({
				where: { courseId: { in: [course.id, otherCourse.id] } },
			});
			await prisma.course.deleteMany({
				where: { id: { in: [course.id, otherCourse.id] } },
			});
			await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
		}
	}, 180_000);

	it("returns nothing for an empty query without calling the model", async () => {
		const org = await prisma.organization.findFirstOrThrow();
		expect(
			await retrieveChunks({ organizationId: org.id, query: "   " }),
		).toEqual([]);
	});

	it("renders an empty context block for no chunks", () => {
		expect(buildContextBlock([])).toBe("");
	});

	it("never silently drops everything when the budget is under one chunk", () => {
		// Regression: a chunk is ~1000 tokens, so any caller whose budget is
		// smaller than a single chunk used to get "" back — indistinguishable
		// from "the material covers nothing", and silently ungrounded.
		const chunk = {
			id: "c1",
			materialId: "m1",
			materialTitle: "Photosynthesis",
			chunkIndex: 0,
			chunkText: "x".repeat(4_000),
			heading: "Light Reactions",
			pageNumber: null,
			similarity: 0.7,
		};

		const tight = buildContextBlock([chunk], 500);
		expect(tight.length).toBeGreaterThan(0);
		expect(tight.length).toBeLessThanOrEqual(500);
		expect(tight).toContain("[Source: Photosynthesis — Light Reactions]");
	});
});
