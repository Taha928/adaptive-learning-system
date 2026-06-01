import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedAdminProcedure } from "@/trpc/init";

/** Platform-level analytics for the admin overview (item 7). */
export const adminAnalyticsRouter = createTRPCRouter({
	getStats: protectedAdminProcedure.query(async () => {
		// lastActiveDate is a date-only (@db.Date) column stored at midnight UTC,
		// so the 7-day window boundary must also be a midnight-UTC date — otherwise
		// the current time-of-day shrinks the window to ~6 days and undercounts.
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
		sevenDaysAgo.setUTCHours(0, 0, 0, 0);

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
