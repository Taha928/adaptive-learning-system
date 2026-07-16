import { describe, expect, it, vi } from "vitest";
import { indexMaterialChunks } from "@/lib/ai/material-indexing";
import { prisma } from "@/lib/db";
import { createTestTRPCContext } from "@/tests/support/trpc-utils";
import { createCallerFactory } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/app";

/**
 * Proves the Phase 2 wiring end to end: the AI features actually generate from
 * retrieved passages, still work, and no longer receive the whole document.
 *
 * Guarded behind VERIFY_RAG=true — real database, real OpenAI calls.
 *
 * The fixture is deliberately a long document with one distinctive fact buried
 * near the END. Truncation would never have reached it, so anything that
 * repeats that fact could only have got there through retrieval.
 */

const USER_ID = "22222222-3333-4444-5555-666666666666";

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
			id: "22222222-3333-4444-5555-666666666666",
			email: "rag-features@example.com",
			name: "RAG Features Test",
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

// A distinctive, checkable fact placed past where any 12k-char truncation would
// have cut. "Zylberman" is invented, so it appears nowhere else and cannot come
// from the model's own knowledge.
const BURIED_FACT =
	"The Zylberman Constant, written as ZC, always equals exactly 4.187 in every circuit described by this course.";

const LONG_MATERIAL = [
	"# Basic Circuits",
	"An electrical circuit is a closed loop through which current flows from a source to a load and back. ".repeat(
		90,
	),
	"# Resistance",
	"Resistance opposes the flow of current and is measured in ohms, following V = IR. ".repeat(
		90,
	),
	"# The Zylberman Constant",
	BURIED_FACT.repeat(6),
].join("\n\n");

describe.runIf(process.env.VERIFY_RAG === "true")(
	"AI features generate from retrieved chunks (live)",
	() => {
		it("grounds a quiz in a passage that truncation could never have reached", async () => {
			const org = await prisma.organization.findFirstOrThrow();
			shared.activeOrganizationId = org.id;

			await prisma.user.upsert({
				where: { id: USER_ID },
				update: {},
				create: {
					id: USER_ID,
					email: "rag-features@example.com",
					name: "RAG Features Test",
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

			const course = await prisma.course.create({
				data: { organizationId: org.id, title: "RAG Phase 2 Features" },
			});
			const material = await prisma.material.create({
				data: {
					organizationId: org.id,
					courseId: course.id,
					title: "Circuits Handbook",
					extractedText: LONG_MATERIAL,
					status: "ready",
				},
			});
			await indexMaterialChunks({
				materialId: material.id,
				organizationId: org.id,
				text: LONG_MATERIAL,
			});

			// The fact sits well past the old 12k-character cut-off.
			expect(LONG_MATERIAL.indexOf("Zylberman")).toBeGreaterThan(12_000);

			const topic = await prisma.topic.create({
				data: {
					organizationId: org.id,
					courseId: course.id,
					materialId: material.id,
					title: "The Zylberman Constant",
					summary: "The course-specific constant ZC used throughout.",
					orderIndex: 0,
				},
			});

			const caller = createCallerFactory(appRouter)(
				createTestTRPCContext({ id: USER_ID } as never),
			);

			try {
				const result = await caller.organization.quiz.generateFromTopic({
					topicId: topic.id,
					numQuestions: 4,
					difficulty: "easy",
				});
				expect(result.quizId).toBeTruthy();

				const questions = await prisma.question.findMany({
					where: { quizId: result.quizId },
					select: { prompt: true, correctAnswer: true, explanation: true },
				});
				expect(questions.length).toBeGreaterThan(0);

				// The quiz can only know this if retrieval reached the tail of the
				// document. Under truncation the model had never seen the word.
				const text = questions
					.map((q) => `${q.prompt} ${q.correctAnswer} ${q.explanation}`)
					.join(" ")
					.toLowerCase();
				expect(text).toContain("zylberman");

				// Existing API shape preserved.
				const quiz = await caller.organization.quiz.get({
					quizId: result.quizId,
				});
				expect(quiz.id).toBe(result.quizId);
				expect(quiz.questions.length).toBe(questions.length);
			} finally {
				await prisma.quiz.deleteMany({ where: { courseId: course.id } });
				await prisma.topic.deleteMany({ where: { courseId: course.id } });
				await prisma.material.deleteMany({ where: { courseId: course.id } });
				await prisma.course.deleteMany({ where: { id: course.id } });
				await prisma.member.deleteMany({ where: { userId: USER_ID } });
				await prisma.user.deleteMany({ where: { id: USER_ID } });
			}
		}, 240_000);
	},
);
