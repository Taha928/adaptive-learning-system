import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { retrieveChunks } from "@/lib/ai/retrieval";
import { prisma } from "@/lib/db";
import { createTestTRPCContext } from "@/tests/support/trpc-utils";
import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/app";

/**
 * DOCX end to end: the real extraction route -> material.create -> chunks ->
 * embeddings -> retrieval -> every AI feature, exactly as a PDF does.
 *
 * Guarded behind VERIFY_RAG=true and DOCX_FIXTURE. Real database, real OpenAI.
 *
 * The fixture buries invented facts deep in the document, so a feature can only
 * repeat one by having actually retrieved it.
 */

const USER_ID = "55555555-6666-7777-8888-999999999999";
const DOCX_PATH = process.env.DOCX_FIXTURE ?? "";
const DOCX_TYPE =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
			id: "55555555-6666-7777-8888-999999999999",
			email: "docx@example.com",
			name: "DOCX Test",
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

const log = (s: string) => console.log(s);

describe.runIf(process.env.VERIFY_RAG === "true" && Boolean(DOCX_PATH))(
	"DOCX pipeline (live)",
	() => {
		it("extracts, indexes and serves a DOCX through every AI feature", async () => {
			const org = await prisma.organization.findFirstOrThrow();
			shared.activeOrganizationId = org.id;

			await prisma.user.upsert({
				where: { id: USER_ID },
				update: {},
				create: {
					id: USER_ID,
					email: "docx@example.com",
					name: "DOCX Test",
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
				data: { organizationId: org.id, title: "DOCX Network Security" },
			});

			try {
				// ---------- 1. EXTRACTION via the real route -------------------
				const { POST } = await import("@/app/api/materials/extract/route");
				const bytes = await readFile(DOCX_PATH);
				const form = new FormData();
				form.append(
					"file",
					new File([new Uint8Array(bytes)], "security-notes.docx", {
						type: DOCX_TYPE,
					}),
				);
				const res = await POST(
					new Request("http://localhost/api/materials/extract", {
						method: "POST",
						body: form,
					}),
				);
				expect(res.status).toBe(200);
				const payload = (await res.json()) as {
					text: string;
					pageCount: number;
				};
				// Response shape unchanged from the PDF contract.
				expect(typeof payload.text).toBe("string");
				expect(typeof payload.pageCount).toBe("number");
				expect(payload.text.length).toBeGreaterThan(10_000);
				log(`DOCX EXTRACT: 200, chars=${payload.text.length}`);

				// ---------- 2. UPLOAD (chunk + embed happen here) --------------
				const t0 = Date.now();
				const material = await caller.organization.material.create({
					courseId: course.id,
					title: "Security Notes (DOCX)",
					fileType: "docx",
					extractedText: payload.text,
				});
				const uploadMs = Date.now() - t0;
				expect(material.status).toBe("ready");
				expect(material.fileType).toBe("docx");

				// ---------- 3. CHUNKS + 4. EMBEDDINGS, same as PDF -------------
				const rows = await prisma.$queryRaw<
					{ n: bigint; dims: number; minnorm: number; heads: number }[]
				>`SELECT count(*) AS n,
					         max(vector_dims(embedding)) AS dims,
					         min(vector_norm(embedding)) AS minnorm,
					         count(heading) AS heads
					    FROM material_chunk WHERE material_id = ${material.id}::uuid`;
				const chunkCount = Number(rows[0]?.n ?? 0);
				expect(chunkCount).toBeGreaterThan(1);
				expect(rows[0]?.dims).toBe(1536);
				expect(Number(rows[0]?.minnorm)).toBeGreaterThan(0.9);
				log(
					`DOCX UPLOAD+EMBED: ${uploadMs}ms, ${chunkCount} chunks, ${Number(rows[0]?.heads)} with headings`,
				);

				// ---------- 5. RETRIEVAL at depth ------------------------------
				const depth: Record<string, boolean> = {};
				for (const [where, m] of Object.entries({
					early: { w: "Vandermeer", q: "What is the Vandermeer Threshold?" },
					middle: {
						w: "Okonkwo",
						q: "What does the Okonkwo Ratio evaluate to?",
					},
					late: { w: "Zylberman", q: "What is the Zylberman Constant?" },
				})) {
					const hits = await retrieveChunks({
						organizationId: org.id,
						courseId: course.id,
						query: m.q,
						topK: 6,
					});
					depth[where] = hits.some((h) => h.chunkText.includes(m.w));
				}
				log(
					`DOCX RETRIEVAL DEPTH: early=${depth.early} middle=${depth.middle} late=${depth.late}`,
				);
				expect(depth.early).toBe(true);
				expect(depth.middle).toBe(true);
				expect(depth.late).toBe(true);

				// ---------- 6. TOPIC GENERATION --------------------------------
				const seg = await caller.organization.material.segmentTopics({
					id: material.id,
					maxTopics: 6,
				});
				expect(seg.topicsCreated).toBeGreaterThan(1);
				const topics = await prisma.topic.findMany({
					where: { materialId: material.id },
					orderBy: { orderIndex: "asc" },
				});
				log(`DOCX TOPICS: ${topics.length}`);
				const first = topics[0];
				if (!first) throw new Error("no topics");

				// ---------- 7. SUMMARIES ---------------------------------------
				const lesson = await caller.organization.topic.generateLesson({
					topicId: first.id,
					force: true,
				});
				expect(lesson.lesson.explanation.length).toBeGreaterThan(200);
				log(`DOCX SUMMARY: ${lesson.lesson.explanation.length} chars`);

				// ---------- 8. ADAPTIVE QUIZ -----------------------------------
				const quiz = await caller.organization.quiz.generateAdaptive({
					courseId: course.id,
					topicId: null,
					numQuestions: 8,
				});
				const quizQs = await prisma.question.findMany({
					where: { quizId: quiz.quizId },
					select: { difficulty: true, topicId: true },
				});
				const tiers = new Set(quizQs.map((q) => q.difficulty));
				log(
					`DOCX ADAPTIVE QUIZ: pool=${quiz.poolSize} served=${quiz.numQuestions} tiers=${tiers.size}`,
				);
				expect(tiers.size).toBeGreaterThan(1);

				// ---------- 9. ADAPTIVE Q&A ------------------------------------
				const qa = await caller.organization.quiz.generateCourseQA({
					courseId: course.id,
					topicId: null,
					numQuestions: 9,
					difficulty: "adaptive",
				});
				const qaQs = await prisma.question.findMany({
					where: { quizId: qa.quizId },
					select: { type: true, difficulty: true },
				});
				expect(new Set(qaQs.map((q) => q.difficulty)).size).toBeGreaterThan(1);
				expect(
					qaQs.every(
						(q) => q.type === "shortAnswer" || q.type === "longAnswer",
					),
				).toBe(true);
				log(`DOCX ADAPTIVE Q&A: pool=${qa.poolSize} served=${qa.numQuestions}`);

				// ---------- 10. STUDY PLAN -------------------------------------
				const plan = await caller.organization.studyPlan.generatePlan({
					courseId: course.id,
					goal: "Pass the network security exam",
				});
				const items = await prisma.studyPlanItem.findMany({
					where: { studyPlanId: plan.id },
				});
				const linked = items.filter((i) => i.topicId).length;
				log(`DOCX STUDY PLAN: ${items.length} steps, ${linked} linked`);
				expect(items.length).toBeGreaterThan(1);
				expect(linked).toBeGreaterThan(0);

				// ---------- 11. AI TUTOR ---------------------------------------
				const { POST: CHAT } = await import("@/app/api/ai/chat/route");
				const chat = await CHAT(
					new Request("http://localhost/api/ai/chat", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							messages: [
								{ role: "user", content: "What is the Zylberman Constant?" },
							],
							organizationId: org.id,
						}),
					}),
				);
				expect(chat.status).toBe(200);
				const answer = await chat.text();
				log(`DOCX TUTOR: ${answer.slice(0, 90).replace(/\s+/g, " ")}…`);
				// Only reachable from the DOCX's final paragraph.
				expect(answer).toContain("4.187");
			} finally {
				await prisma.quiz.deleteMany({ where: { courseId: course.id } });
				await prisma.studyPlan.deleteMany({
					where: { organizationId: org.id, userId: USER_ID },
				});
				await prisma.topic.deleteMany({ where: { courseId: course.id } });
				await prisma.material.deleteMany({ where: { courseId: course.id } });
				await prisma.course.deleteMany({ where: { id: course.id } });
				await prisma.member.deleteMany({ where: { userId: USER_ID } });
				await prisma.user.deleteMany({ where: { id: USER_ID } });
			}
		}, 900_000);

		it("still rejects an unsupported format", async () => {
			const { POST } = await import("@/app/api/materials/extract/route");
			const form = new FormData();
			form.append(
				"file",
				new File([new Uint8Array([80, 75, 3, 4])], "deck.pptx", {
					type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
				}),
			);
			const res = await POST(
				new Request("http://localhost/api/materials/extract", {
					method: "POST",
					body: form,
				}),
			);
			expect(res.status).toBe(415);
		});
	},
);
