import { PerformanceEventType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateLesson, type Lesson, lessonSchema } from "@/lib/ai/lesson";
import { retrieveContext } from "@/lib/ai/retrieval";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordStreakActivity } from "@/lib/streak";
import {
	generateLessonSchema,
	topicIdSchema,
} from "@/schemas/organization-topic-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

/**
 * A lesson teaches one topic in depth, so it is worth more passages than a
 * single tutor answer — but still a small, bounded set rather than the document.
 */
const LESSON_TOP_K = 8;

/**
 * Topic lessons — the "teach" step.
 *
 * The generated lesson is cached as JSON on the existing `Topic.content`
 * column, which the schema already had and nothing else ever wrote to. That
 * keeps this feature migration-free. `content` is also read as extra source
 * material by quiz generation, which is a happy accident: once a topic has been
 * taught, its quizzes are grounded in the same lesson the student just read.
 */

/** Safely parse a cached lesson; returns null if absent or stale/invalid. */
function parseLesson(content: string | null): Lesson | null {
	if (!content) return null;
	try {
		const parsed = lessonSchema.safeParse(JSON.parse(content));
		return parsed.success ? parsed.data : null;
	} catch {
		// Legacy or hand-written content that isn't lesson JSON — ignore it
		// rather than failing the page.
		return null;
	}
}

export const organizationTopicRouter = createTRPCRouter({
	// A topic plus its cached lesson (if it has been taught yet).
	get: protectedOrganizationProcedure
		.input(topicIdSchema)
		.query(async ({ ctx, input }) => {
			const topic = await prisma.topic.findFirst({
				where: {
					id: input.topicId,
					organizationId: ctx.organization.id,
				},
				select: {
					id: true,
					title: true,
					summary: true,
					content: true,
					courseId: true,
					estimatedMinutes: true,
					course: { select: { id: true, title: true } },
				},
			});

			if (!topic) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });
			}

			const lesson = parseLesson(topic.content);

			// The easiest quiz already generated for this topic, so the lesson can
			// hand the student straight into practice.
			const quiz = await prisma.quiz.findFirst({
				where: {
					topicId: topic.id,
					organizationId: ctx.organization.id,
				},
				orderBy: { createdAt: "desc" },
				select: { id: true, difficulty: true },
			});

			return {
				topic: {
					id: topic.id,
					title: topic.title,
					summary: topic.summary,
					courseId: topic.courseId,
					courseTitle: topic.course?.title ?? null,
					estimatedMinutes: topic.estimatedMinutes,
				},
				lesson,
				quizId: quiz?.id ?? null,
			};
		}),

	// Teach a topic: generate the lesson and cache it on Topic.content.
	// Any member may do this for themselves — it is reading, not authoring.
	generateLesson: protectedOrganizationProcedure
		.input(generateLessonSchema)
		.mutation(async ({ ctx, input }) => {
			const topic = await prisma.topic.findFirst({
				where: {
					id: input.topicId,
					organizationId: ctx.organization.id,
				},
				select: {
					id: true,
					title: true,
					summary: true,
					content: true,
					courseId: true,
					materialId: true,
				},
			});

			if (!topic) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });
			}

			// Serve the cached lesson unless the caller explicitly asked to redo it.
			const cached = parseLesson(topic.content);
			if (cached && !input.force) {
				return { lesson: cached, cached: true };
			}

			// Retrieve the passages about THIS topic rather than handing the model
			// the whole material and hoping the relevant part survived truncation.
			// Scoped to the topic's own material when it has one, so a lesson is
			// taught from its own source rather than a similarly-worded chapter.
			const { context } = await retrieveContext({
				organizationId: ctx.organization.id,
				courseId: topic.courseId,
				materialIds: topic.materialId ? [topic.materialId] : null,
				query: [topic.title, topic.summary].filter(Boolean).join(". "),
				topK: LESSON_TOP_K,
			});

			let lesson: Lesson;
			try {
				lesson = await generateLesson({
					topicTitle: topic.title,
					topicSummary: topic.summary,
					sourceText: context || null,
				});
			} catch (error) {
				logger.error(
					{ error, topicId: topic.id, organizationId: ctx.organization.id },
					"Failed to generate lesson",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not generate this lesson. Please try again.",
				});
			}

			// Cache outside any transaction — the AI call above is far too slow to
			// hold one open (interactive transactions time out at 5s).
			await prisma.topic.update({
				where: { id: topic.id },
				data: { content: JSON.stringify(lesson) },
			});

			await prisma.performanceLog.create({
				data: {
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					courseId: topic.courseId,
					topicId: topic.id,
					eventType: PerformanceEventType.lessonViewed,
				},
			});

			// Reading a lesson counts as learning activity.
			await recordStreakActivity(ctx.user.id);

			return { lesson, cached: false };
		}),

	// Mark a lesson as finished — logs the previously-dead lessonCompleted event.
	markLessonCompleted: protectedOrganizationProcedure
		.input(topicIdSchema)
		.mutation(async ({ ctx, input }) => {
			const topic = await prisma.topic.findFirst({
				where: { id: input.topicId, organizationId: ctx.organization.id },
				select: { id: true, courseId: true },
			});

			if (!topic) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });
			}

			await prisma.performanceLog.create({
				data: {
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					courseId: topic.courseId,
					topicId: topic.id,
					eventType: PerformanceEventType.lessonCompleted,
				},
			});

			await recordStreakActivity(ctx.user.id);

			return { success: true };
		}),
});
