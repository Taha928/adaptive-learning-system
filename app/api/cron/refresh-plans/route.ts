import { StudyPlanStatus } from "@prisma/client";
import { buildItemRows, generatePlanContent } from "@/lib/ai/study-plan";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Plan regeneration calls the LLM per active plan; give it room on Vercel.
export const maxDuration = 60;

/**
 * Vercel Cron: nightly autonomous refresh of active study plans (SRS R8/R9).
 *
 * For every active, AI-generated plan we re-run the same generation logic the
 * interactive `generatePlan` mutation uses, so each learner's roadmap keeps
 * re-prioritising their currently-weak topics as performance data accrues.
 *
 * Guarded by CRON_SECRET via the `Authorization: Bearer <secret>` header that
 * Vercel Cron sends. If CRON_SECRET is unset we allow the request (local dev).
 */
export async function GET(req: Request): Promise<Response> {
	const secret = process.env.CRON_SECRET;
	if (secret) {
		const authHeader = req.headers.get("authorization");
		if (authHeader !== `Bearer ${secret}`) {
			return Response.json(
				{ error: "unauthorized", message: "Invalid cron secret" },
				{ status: 401 },
			);
		}
	}

	const plans = await prisma.studyPlan.findMany({
		where: { status: StudyPlanStatus.active, generatedByAi: true },
		select: {
			id: true,
			organizationId: true,
			userId: true,
			courseId: true,
			goal: true,
		},
	});

	let refreshed = 0;
	let failed = 0;

	for (const plan of plans) {
		try {
			const { generated, topics } = await generatePlanContent({
				organizationId: plan.organizationId,
				userId: plan.userId,
				courseId: plan.courseId,
				goal: plan.goal,
			});

			await prisma.$transaction(async (tx) => {
				// Replace the existing roadmap with the freshly prioritised one,
				// strictly scoped to this plan + organization.
				await tx.studyPlanItem.deleteMany({
					where: {
						studyPlanId: plan.id,
						organizationId: plan.organizationId,
					},
				});

				const rows = buildItemRows({
					organizationId: plan.organizationId,
					studyPlanId: plan.id,
					generated,
					topics,
				});

				if (rows.length > 0) {
					await tx.studyPlanItem.createMany({ data: rows });
				}

				await tx.studyPlan.updateMany({
					where: { id: plan.id, organizationId: plan.organizationId },
					data: { title: generated.title, goal: plan.goal ?? generated.goal },
				});
			});

			refreshed += 1;
		} catch (error) {
			failed += 1;
			logger.error(
				{ error, studyPlanId: plan.id, organizationId: plan.organizationId },
				"Failed to refresh study plan in cron",
			);
		}
	}

	logger.info(
		{ total: plans.length, refreshed, failed },
		"Study plan cron refresh complete",
	);

	return Response.json({
		success: true,
		total: plans.length,
		refreshed,
		failed,
	});
}
