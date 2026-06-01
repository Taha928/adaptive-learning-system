import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * StudyNex streak tracking (item 4).
 *
 * A streak is the number of consecutive days a user completes at least one
 * learning activity (AI tutor chat, quiz attempt, or study session). It:
 *   • increases by 1 on the first activity of a new day that directly follows
 *     the previous active day,
 *   • stays the same for additional activities on the same day,
 *   • resets to 1 if a day was missed.
 *
 * Days are compared in UTC to keep the rule simple and deterministic.
 */

/** Whole-day number (UTC) for a date — days since the Unix epoch. */
function utcDayNumber(date: Date): number {
	return Math.floor(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
			86_400_000,
	);
}

/**
 * Records a learning activity for the user and updates their streak.
 *
 * Safe to call from any activity path: it never throws — failures are logged
 * and swallowed so they cannot break the user-facing action.
 */
export async function recordStreakActivity(userId: string): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				currentStreak: true,
				longestStreak: true,
				lastActiveDate: true,
			},
		});
		if (!user) {
			return;
		}

		const todayNum = utcDayNumber(new Date());
		const lastNum = user.lastActiveDate
			? utcDayNumber(user.lastActiveDate)
			: null;

		// Already counted an activity today — nothing to do.
		if (lastNum === todayNum) {
			return;
		}

		// Consecutive day → extend; otherwise (gap or first ever) → restart at 1.
		const nextStreak = lastNum === todayNum - 1 ? user.currentStreak + 1 : 1;
		const longestStreak = Math.max(user.longestStreak, nextStreak);

		await prisma.user.update({
			where: { id: userId },
			data: {
				currentStreak: nextStreak,
				longestStreak,
				// Store as a date-only value (midnight UTC).
				lastActiveDate: new Date(
					`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
				),
			},
		});
	} catch (error) {
		logger.warn({ error, userId }, "Failed to record streak activity");
	}
}
