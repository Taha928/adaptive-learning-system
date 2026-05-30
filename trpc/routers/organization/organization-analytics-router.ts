import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

/** Mastery threshold below which a topic is considered "weak". */
const WEAK_MASTERY_THRESHOLD = 0.6;

/** Instructors (owner/admin) see org-wide aggregates; members see only their own data. */
function isInstructor(role: string): boolean {
	return role === "owner" || role === "admin";
}

export const organizationAnalyticsRouter = createTRPCRouter({
	/**
	 * High-level counts for the org plus an average quiz score.
	 * Members see only their own attempts/average; instructors see org-wide.
	 */
	getOverview: protectedOrganizationProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.organization.id;
		const instructor = isInstructor(ctx.membership.role);

		const attemptWhere: Prisma.QuizAttemptWhereInput = {
			organizationId,
			status: "graded",
			...(instructor ? {} : { userId: ctx.user.id }),
		};

		const [courseCount, quizCount, attemptCount, scoreAgg] = await Promise.all([
			prisma.course.count({ where: { organizationId } }),
			prisma.quiz.count({ where: { organizationId } }),
			prisma.quizAttempt.count({ where: attemptWhere }),
			prisma.quizAttempt.aggregate({
				where: { ...attemptWhere, percentage: { not: null } },
				_avg: { percentage: true },
			}),
		]);

		return {
			courseCount,
			quizCount,
			attemptCount,
			averageScore:
				scoreAgg._avg.percentage != null
					? Number(scoreAgg._avg.percentage.toFixed(1))
					: null,
			scope: instructor ? ("organization" as const) : ("self" as const),
		};
	}),

	/**
	 * Latest mastery score per topic. For members this is their own latest
	 * PerformanceLog masteryScore per topic; for instructors it is the average
	 * of the latest masteryScore across all members per topic.
	 */
	getTopicMastery: protectedOrganizationProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.organization.id;
		const instructor = isInstructor(ctx.membership.role);

		const topics = await prisma.topic.findMany({
			where: { organizationId },
			select: { id: true, title: true },
			orderBy: { orderIndex: "asc" },
		});

		if (topics.length === 0) {
			return [] as { topicId: string; topicTitle: string; mastery: number }[];
		}

		const logWhere: Prisma.PerformanceLogWhereInput = {
			organizationId,
			topicId: { in: topics.map((t) => t.id) },
			masteryScore: { not: null },
			...(instructor ? {} : { userId: ctx.user.id }),
		};

		// Pull masteryScore logs newest-first so we can take the latest per
		// (topic, user) pairing in memory.
		const logs = await prisma.performanceLog.findMany({
			where: logWhere,
			select: {
				topicId: true,
				userId: true,
				masteryScore: true,
				occurredAt: true,
			},
			orderBy: { occurredAt: "desc" },
		});

		// latestByTopicUser: topicId -> userId -> latest masteryScore
		const latestByTopicUser = new Map<string, Map<string, number>>();
		for (const log of logs) {
			if (!log.topicId || log.masteryScore == null) continue;
			let byUser = latestByTopicUser.get(log.topicId);
			if (!byUser) {
				byUser = new Map<string, number>();
				latestByTopicUser.set(log.topicId, byUser);
			}
			// logs are ordered desc, so the first one seen per user is the latest
			if (!byUser.has(log.userId)) {
				byUser.set(log.userId, log.masteryScore);
			}
		}

		const titleById = new Map(topics.map((t) => [t.id, t.title]));

		return topics
			.filter((t) => latestByTopicUser.has(t.id))
			.map((t) => {
				const byUser = latestByTopicUser.get(t.id);
				const values = byUser ? Array.from(byUser.values()) : [];
				const mastery =
					values.length > 0
						? values.reduce((sum, v) => sum + v, 0) / values.length
						: 0;
				return {
					topicId: t.id,
					topicTitle: titleById.get(t.id) ?? "Untitled topic",
					mastery: Number(mastery.toFixed(4)),
				};
			});
	}),

	/**
	 * Recent graded quiz attempts ordered chronologically, suitable for a
	 * line chart of accuracy over time.
	 */
	getAccuracyTrend: protectedOrganizationProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.organization.id;
		const instructor = isInstructor(ctx.membership.role);

		const attempts = await prisma.quizAttempt.findMany({
			where: {
				organizationId,
				status: "graded",
				percentage: { not: null },
				submittedAt: { not: null },
				...(instructor ? {} : { userId: ctx.user.id }),
			},
			select: { submittedAt: true, percentage: true },
			orderBy: { submittedAt: "desc" },
			take: 30,
		});

		// Re-order ascending for charting (oldest -> newest).
		return attempts
			.filter((a) => a.submittedAt != null && a.percentage != null)
			.reverse()
			.map((a) => ({
				date: (a.submittedAt as Date).toISOString(),
				percentage: Number((a.percentage as number).toFixed(1)),
			}));
	}),

	/**
	 * Topics where the user (or org aggregate for instructors) is underperforming:
	 * latest mastery below the threshold. Drives the weak-topic alert banner and,
	 * later, AI study-plan generation.
	 */
	getWeakTopics: protectedOrganizationProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.organization.id;
		const instructor = isInstructor(ctx.membership.role);

		try {
			const topics = await prisma.topic.findMany({
				where: { organizationId },
				select: { id: true, title: true },
				orderBy: { orderIndex: "asc" },
			});

			if (topics.length === 0) {
				return [] as {
					topicId: string;
					topicTitle: string;
					mastery: number;
				}[];
			}

			const logs = await prisma.performanceLog.findMany({
				where: {
					organizationId,
					topicId: { in: topics.map((t) => t.id) },
					masteryScore: { not: null },
					...(instructor ? {} : { userId: ctx.user.id }),
				},
				select: { topicId: true, userId: true, masteryScore: true },
				orderBy: { occurredAt: "desc" },
			});

			const latestByTopicUser = new Map<string, Map<string, number>>();
			for (const log of logs) {
				if (!log.topicId || log.masteryScore == null) continue;
				let byUser = latestByTopicUser.get(log.topicId);
				if (!byUser) {
					byUser = new Map<string, number>();
					latestByTopicUser.set(log.topicId, byUser);
				}
				if (!byUser.has(log.userId)) {
					byUser.set(log.userId, log.masteryScore);
				}
			}

			const titleById = new Map(topics.map((t) => [t.id, t.title]));

			return topics
				.filter((t) => latestByTopicUser.has(t.id))
				.map((t) => {
					const byUser = latestByTopicUser.get(t.id);
					const values = byUser ? Array.from(byUser.values()) : [];
					const mastery =
						values.length > 0
							? values.reduce((sum, v) => sum + v, 0) / values.length
							: 0;
					return {
						topicId: t.id,
						topicTitle: titleById.get(t.id) ?? "Untitled topic",
						mastery: Number(mastery.toFixed(4)),
					};
				})
				.filter((t) => t.mastery < WEAK_MASTERY_THRESHOLD)
				.sort((a, b) => a.mastery - b.mastery);
		} catch (error) {
			logger.error({ error, organizationId }, "Failed to compute weak topics");
			throw error;
		}
	}),
});
