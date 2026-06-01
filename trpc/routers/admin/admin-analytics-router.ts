import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedAdminProcedure } from "@/trpc/init";

/** Platform-level analytics for the admin overview (item 7). */
export const adminAnalyticsRouter = createTRPCRouter({
	getStats: protectedAdminProcedure.query(async () => {
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

		const [
			totalStudents,
			activeStudents,
			totalCourses,
			totalQuizzes,
			totalAttempts,
			totalChats,
		] = await Promise.all([
			prisma.user.count({ where: { role: "user" } }),
			prisma.user.count({
				where: { role: "user", lastActiveDate: { gte: sevenDaysAgo } },
			}),
			prisma.course.count(),
			prisma.quiz.count(),
			prisma.quizAttempt.count({ where: { status: "graded" } }),
			prisma.aiChat.count(),
		]);

		return {
			totalStudents,
			activeStudents,
			inactiveStudents: Math.max(0, totalStudents - activeStudents),
			totalCourses,
			totalQuizzes,
			totalAttempts,
			totalChats,
		};
	}),
});
