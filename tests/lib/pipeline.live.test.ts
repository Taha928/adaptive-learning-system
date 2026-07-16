import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it, vi } from "vitest";
import { retrieveChunks } from "@/lib/ai/retrieval";
import { prisma } from "@/lib/db";
import { createTestTRPCContext } from "@/tests/support/trpc-utils";
import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/app";

/**
 * Whole-pipeline verification against a real 50-page PDF.
 *
 * Runs the actual path a document takes: unpdf extraction -> material.create ->
 * chunking -> embeddings -> retrieval -> every AI feature. Real database, real
 * OpenAI. Guarded behind VERIFY_RAG=true and the fixture path.
 *
 * Run it with:
 *   $env:VERIFY_RAG="true"; $env:PIPELINE_PDF="<path>"
 *   npm run with-dev-env -- vitest run tests/lib/pipeline.live.test.ts
 *
 * The document plants three invented facts at known depths — one early, one at
 * the midpoint, one near the end. They are nonsense words, so a model can only
 * reproduce them by having actually been given that passage. That is what makes
 * "retrieval works" checkable rather than asserted.
 */

const USER_ID = "33333333-4444-5555-6666-777777777777";
const PDF_PATH = process.env.PIPELINE_PDF ?? "";

const MARKERS = {
	early: { word: "Vandermeer", query: "What is the Vandermeer Threshold?" },
	middle: {
		word: "Okonkwo",
		query: "What does the Okonkwo Ratio evaluate to?",
	},
	late: {
		word: "Zylberman",
		query: "What is the value of the Zylberman Constant?",
	},
};

const shared = vi.hoisted(() => ({
	activeOrganizationId: null as string | null,
	fullOrganization: null as unknown,
}));

vi.mock("@/lib/auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth")>();
	return {
		...actual,
		auth: {
			...actual.auth,
			api: {
				...actual.auth.api,
				getFullOrganization: async () => shared.fullOrganization,
			},
		},
	};
});
vi.mock("next/headers", () => ({ headers: () => new Headers() }));
vi.mock("@/lib/auth/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/server")>()),
	getSession: async () => ({
		user: {
			id: "33333333-4444-5555-6666-777777777777",
			email: "pipeline@example.com",
			name: "Pipeline Test",
			role: "user",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			image: null,
			banned: false,
		},
		session: { activeOrganizationId: shared.activeOrganizationId },
	}),
}));

const report: string[] = [];
const log = (line: string) => {
	report.push(line);
	console.log(line);
};

describe.runIf(process.env.VERIFY_RAG === "true" && Boolean(PDF_PATH))(
	"full AI pipeline (live, 50-page PDF)",
	() => {
		it("runs upload -> chunk -> embed -> retrieve -> every AI feature", async () => {
			const org = await prisma.organization.findFirstOrThrow();
			shared.activeOrganizationId = org.id;

			await prisma.user.upsert({
				where: { id: USER_ID },
				update: {},
				create: {
					id: USER_ID,
					email: "pipeline@example.com",
					name: "Pipeline Test",
					emailVerified: true,
				},
			});
			await prisma.member.upsert({
				where: {
					userId_organizationId: { userId: USER_ID, organizationId: org.id },
				},
				update: { role: "owner" },
				create: { userId: USER_ID, organizationId: org.id, role: "owner" },
			});
			shared.fullOrganization = {
				...org,
				members: await prisma.member.findMany({
					where: { organizationId: org.id },
				}),
			};

			const caller = createCallerFactory(appRouter)(
				createTestTRPCContext({ id: USER_ID } as never),
			);
			const course = await prisma.course.create({
				data: { organizationId: org.id, title: "Network Security (Pipeline)" },
			});

			let materialId: string | null = null;

			try {
				// ---------- 1. EXTRACTION (the real /api/materials/extract logic)
				const pdf = await getDocumentProxy(
					new Uint8Array(await readFile(PDF_PATH)),
				);
				const { text, totalPages } = await extractText(pdf, {
					mergePages: true,
				});
				const extracted = Array.isArray(text) ? text.join("\n\n") : text;
				log(
					`EXTRACT: pages=${totalPages} chars=${extracted.length} (~${Math.ceil(extracted.length / 4)} tokens)`,
				);
				expect(totalPages).toBeGreaterThanOrEqual(40);

				// ---------- 2. UPLOAD (embeddings happen inside this call)
				const t0 = Date.now();
				const material = await caller.organization.material.create({
					courseId: course.id,
					title: "Network Security Handbook",
					fileType: "pdf",
					extractedText: extracted,
				});
				const uploadMs = Date.now() - t0;
				materialId = material.id;
				expect(material.status).toBe("ready");

				// ---------- 3. CHUNKING + 4. EMBEDDINGS
				const rows = await prisma.$queryRaw<
					{ n: bigint; dims: number; minnorm: number; avgchars: number }[]
				>`SELECT count(*) AS n,
					         max(vector_dims(embedding)) AS dims,
					         min(vector_norm(embedding)) AS minnorm,
					         avg(length(chunk_text)) AS avgchars
					    FROM material_chunk WHERE material_id = ${material.id}::uuid`;
				const chunkCount = Number(rows[0]?.n ?? 0);
				expect(chunkCount).toBeGreaterThan(20);
				expect(rows[0]?.dims).toBe(1536);
				expect(Number(rows[0]?.minnorm)).toBeGreaterThan(0.9);

				log(
					`UPLOAD+EMBED: ${uploadMs}ms total for ${chunkCount} chunks -> ${(uploadMs / chunkCount).toFixed(0)}ms/chunk (avg ${Math.round(Number(rows[0]?.avgchars))} chars/chunk)`,
				);

				// ---------- 5. RETRIEVAL (latency + can it reach every depth?)
				const latencies: number[] = [];
				const found: Record<string, boolean> = {};
				for (const [where, marker] of Object.entries(MARKERS)) {
					const t = Date.now();
					const hits = await retrieveChunks({
						organizationId: org.id,
						courseId: course.id,
						query: marker.query,
						topK: 6,
					});
					latencies.push(Date.now() - t);
					found[where] = hits.some((h) => h.chunkText.includes(marker.word));
				}
				// Extra queries so the latency average is not built from three points.
				for (const q of [
					"How does TLS negotiate a cipher suite?",
					"What is the difference between mandatory and role-based access control?",
					"How does a stateful firewall differ from a packet filter?",
					"What are the stages of incident response?",
				]) {
					const t = Date.now();
					await retrieveChunks({
						organizationId: org.id,
						courseId: course.id,
						query: q,
						topK: 6,
					});
					latencies.push(Date.now() - t);
				}
				const avg = Math.round(
					latencies.reduce((a, b) => a + b, 0) / latencies.length,
				);
				const sorted = [...latencies].sort((a, b) => a - b);
				log(
					`RETRIEVAL: avg=${avg}ms min=${sorted[0]}ms max=${sorted.at(-1)}ms over ${latencies.length} queries`,
				);
				log(
					`RETRIEVAL DEPTH: early=${found.early} middle=${found.middle} late=${found.late}`,
				);
				// The whole point of Phase 2: reachable at any depth, including
				// pages the old truncation never sent.
				expect(found.early).toBe(true);
				expect(found.middle).toBe(true);
				expect(found.late).toBe(true);

				// ---------- 6. TOPIC GENERATION
				const seg = await caller.organization.material.segmentTopics({
					id: material.id,
					maxTopics: 6,
				});
				expect(seg.topicsCreated).toBeGreaterThan(1);
				const topics = await prisma.topic.findMany({
					where: { materialId: material.id },
					orderBy: { orderIndex: "asc" },
				});
				log(
					`TOPICS: ${topics.length} -> ${topics.map((t) => t.title).join(" | ")}`,
				);

				const firstTopic = topics[0];
				if (!firstTopic) throw new Error("no topics generated");

				// ---------- 7. SUMMARIES (lesson)
				const lesson = await caller.organization.topic.generateLesson({
					topicId: firstTopic.id,
					force: true,
				});
				expect(lesson.lesson.explanation.length).toBeGreaterThan(200);
				expect(lesson.lesson.keyConcepts.length).toBeGreaterThan(1);
				log(
					`SUMMARY: lesson for "${firstTopic.title}" — ${lesson.lesson.explanation.length} chars, ${lesson.lesson.keyConcepts.length} key concepts`,
				);

				// ---------- 8. ADAPTIVE QUIZ
				const quiz = await caller.organization.quiz.generateAdaptive({
					courseId: course.id,
					topicId: null,
					numQuestions: 8,
				});
				expect(quiz.quizId).toBeTruthy();
				// The pool must be deeper than the session it serves — that surplus
				// is what the engine adapts over.
				expect(quiz.poolSize).toBeGreaterThan(quiz.numQuestions);
				const quizQs = await prisma.question.findMany({
					where: { quizId: quiz.quizId },
					select: { difficulty: true, topicId: true, prompt: true },
				});
				const tiers = new Set(quizQs.map((q) => q.difficulty));
				const quizTopics = new Set(quizQs.map((q) => q.topicId));
				log(
					`ADAPTIVE QUIZ: pool=${quiz.poolSize} served=${quiz.numQuestions}/${quiz.requestedQuestions} tiers=[${[...tiers].join(",")}] topics=${quizTopics.size}`,
				);
				// Adaptation needs more than one level and more than one topic to
				// choose between; that is what the engine selects over.
				expect(tiers.size).toBeGreaterThan(1);
				expect(quizTopics.size).toBeGreaterThan(1);
				// No difficulty labels leaked into what the student reads.
				expect(
					quizQs.some((q) => /\[(easy|medium|hard)\]/i.test(q.prompt)),
				).toBe(false);

				// ---------- 9. ADAPTIVE Q&A (revision)
				const qa = await caller.organization.quiz.generateCourseQA({
					courseId: course.id,
					topicId: null,
					numQuestions: 9,
					difficulty: "adaptive",
				});
				expect(qa.quizId).toBeTruthy();
				const qaQs = await prisma.question.findMany({
					where: { quizId: qa.quizId },
					select: { difficulty: true, type: true },
				});
				const qaTiers = new Set(qaQs.map((q) => q.difficulty));
				const qaTypes = new Set(qaQs.map((q) => q.type));
				log(
					`ADAPTIVE Q&A: pool=${qa.poolSize} served=${qa.numQuestions}/${qa.requestedQuestions} tiers=[${[...qaTiers].join(",")}] types=[${[...qaTypes].join(",")}]`,
				);
				expect(qaTiers.size).toBeGreaterThan(1);
				// Revision is written-answer only by construction.
				expect(
					[...qaTypes].every((t) => t === "shortAnswer" || t === "longAnswer"),
				).toBe(true);

				// ---------- 10. STUDY PLAN
				const plan = await caller.organization.studyPlan.generatePlan({
					courseId: course.id,
					goal: "Pass the network security final exam",
				});
				const planItems = await prisma.studyPlanItem.findMany({
					where: { studyPlanId: plan.id },
				});
				expect(planItems.length).toBeGreaterThan(1);
				const linked = planItems.filter((i) => i.topicId).length;
				log(
					`STUDY PLAN: "${plan.title}" — ${planItems.length} steps, ${linked}/${planItems.length} linked to real topics`,
				);
				expect(planItems.length).toBeGreaterThan(1);
				// Every step that names a topic must reach it. Steps are matched by
				// meaning now, so the only ones legitimately unlinked are those that
				// belong to no single topic — typically the final review step. One
				// such step is expected; a second means matching is missing real ones.
				const unlinked = planItems.length - linked;
				expect(linked).toBe(topics.length);
				expect(unlinked).toBeLessThanOrEqual(1);

				// ---------- 11. AI TUTOR (the real streaming route)
				const { POST } = await import("@/app/api/ai/chat/route");

				const ask = async (question: string) => {
					const res = await POST(
						new Request("http://localhost/api/ai/chat", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								messages: [{ role: "user", content: question }],
								organizationId: org.id,
							}),
						}),
					);
					expect(res.status).toBe(200);
					return await res.text();
				};

				// (a) grounded: answer must come from a page truncation never sent.
				const grounded = await ask(MARKERS.late.query);
				log(
					`TUTOR (in material): ${grounded.slice(0, 110).replace(/\s+/g, " ")}…`,
				);
				expect(grounded.toLowerCase()).toContain("4.187");

				// (b) not in material: must SAY SO before answering generally.
				const offTopic = await ask(
					"Who won the 1978 FIFA World Cup final, and what was the score?",
				);
				log(
					`TUTOR (not in material): ${offTopic.slice(0, 110).replace(/\s+/g, " ")}…`,
				);
				// Models emit a typographic apostrophe (U+2019), not ASCII, so the
				// pattern must accept both or it fails on correct output.
				const disclosed =
					/(does\s?n['’]t|does not|do\s?n['’]t|do not|is\s?n['’]t|is not|no|nothing).{0,40}(cover|contain|mention|include|have|relevant)|not (covered|found|mentioned|included|present) in/i.test(
						offTopic,
					);
				expect(disclosed).toBe(true);

				log("\n--- PIPELINE REPORT ---\n" + report.join("\n"));
			} finally {
				await prisma.quiz.deleteMany({ where: { courseId: course.id } });
				await prisma.studyPlan.deleteMany({
					where: { organizationId: org.id, userId: USER_ID },
				});
				await prisma.topic.deleteMany({ where: { courseId: course.id } });
				if (materialId) {
					await prisma.material.deleteMany({ where: { id: materialId } });
				}
				await prisma.course.deleteMany({ where: { id: course.id } });
				await prisma.member.deleteMany({ where: { userId: USER_ID } });
				await prisma.user.deleteMany({ where: { id: USER_ID } });
			}
		}, 900_000);
	},
);
