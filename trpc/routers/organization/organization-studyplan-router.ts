import { PerformanceEventType, StudyPlanStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { buildItemRows, generatePlanContent } from "@/lib/ai/study-plan";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordStreakActivity } from "@/lib/streak";
import {
	generatePlanSchema,
	listStudyPlansSchema,
	markItemCompleteSchema,
	studyPlanIdSchema,
} from "@/schemas/organization-studyplan-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

export const organizationStudyPlanRouter = createTRPCRouter({
	// List the current user's plans, org-scoped, with items ordered.
	list: protectedOrganizationProcedure
		.input(listStudyPlansSchema)
		.query(async ({ ctx, input }) => {
			const plans = await prisma.studyPlan.findMany({
				where: {
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					...(input?.courseId ? { courseId: input.courseId } : {}),
				},
				orderBy: { createdAt: "desc" },
				include: {
					items: {
						orderBy: { orderIndex: "asc" },
					},
				},
			});

			return { plans };
		}),

	// Get a single plan with items + linked topic titles.
	get: protectedOrganizationProcedure
		.input(studyPlanIdSchema)
		.query(async ({ ctx, input }) => {
			const plan = await prisma.studyPlan.findFirst({
				where: {
					id: input.id,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
				include: {
					items: {
						orderBy: { orderIndex: "asc" },
						include: {
							topic: { select: { id: true, title: true } },
						},
					},
				},
			});

			if (!plan) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Study plan not found",
				});
			}

			return plan;
		}),

	// Generate a personalised AI study plan for the current user.
	// Any member may generate their own plan (students included).
	generatePlan: protectedOrganizationProcedure
		.input(generatePlanSchema)
		.mutation(async ({ ctx, input }) => {
			// Validate the course belongs to this org if one was supplied.
			if (input.courseId) {
				const course = await prisma.course.findFirst({
					where: { id: input.courseId, organizationId: ctx.organization.id },
					select: { id: true },
				});
				if (!course) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Course not found",
					});
				}
			}

			let generated: Awaited<
				ReturnType<typeof generatePlanContent>
			>["generated"];
			let topics: Awaited<ReturnType<typeof generatePlanContent>>["topics"];

			try {
				const result = await generatePlanContent({
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					courseId: input.courseId ?? null,
					goal: input.goal ?? null,
				});
				generated = result.generated;
				topics = result.topics;
			} catch (error) {
				logger.error(
					{ error, organizationId: ctx.organization.id, userId: ctx.user.id },
					"Failed to generate study plan content",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not generate a study plan right now",
				});
			}

			const plan = await prisma.$transaction(async (tx) => {
				const created = await tx.studyPlan.create({
					data: {
						organizationId: ctx.organization.id,
						userId: ctx.user.id,
						courseId: input.courseId ?? null,
						title: generated.title,
						goal: input.goal ?? generated.goal,
						status: StudyPlanStatus.active,
						generatedByAi: true,
						startDate: new Date(),
					},
				});

				const rows = buildItemRows({
					organizationId: ctx.organization.id,
					studyPlanId: created.id,
					generated,
					topics,
				});

				if (rows.length > 0) {
					await tx.studyPlanItem.createMany({ data: rows });
				}

				const full = await tx.studyPlan.findUnique({
					where: { id: created.id },
					include: { items: { orderBy: { orderIndex: "asc" } } },
				});

				if (!full) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to load generated study plan",
					});
				}
				return full;
			});

			return plan;
		}),

	// Mark a single item complete (org + user scoped, atomic) + log it.
	markItemComplete: protectedOrganizationProcedure
		.input(markItemCompleteSchema)
		.mutation(async ({ ctx, input }) => {
			// Ensure the item belongs to a plan owned by this user in this org.
			const item = await prisma.studyPlanItem.findFirst({
				where: {
					id: input.itemId,
					organizationId: ctx.organization.id,
					studyPlan: {
						organizationId: ctx.organization.id,
						userId: ctx.user.id,
					},
				},
				include: {
					studyPlan: { select: { id: true, courseId: true } },
				},
			});

			if (!item) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Study plan item not found",
				});
			}

			const now = new Date();

			const updated = await prisma.$transaction(async (tx) => {
				const result = await tx.studyPlanItem.updateMany({
					where: {
						id: input.itemId,
						organizationId: ctx.organization.id,
					},
					data: { status: "completed", completedAt: now },
				});

				if (result.count === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Study plan item not found",
					});
				}

				await tx.performanceLog.create({
					data: {
						organizationId: ctx.organization.id,
						userId: ctx.user.id,
						courseId: item.studyPlan.courseId ?? null,
						topicId: item.topicId ?? null,
						eventType: PerformanceEventType.planItemCompleted,
						occurredAt: now,
						metadata: {
							studyPlanId: item.studyPlan.id,
							studyPlanItemId: input.itemId,
						},
					},
				});

				const fresh = await tx.studyPlanItem.findUnique({
					where: { id: input.itemId },
				});
				if (!fresh) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to load updated item",
					});
				}
				return fresh;
			});

			// Completing a study-plan item counts toward the learning streak.
			await recordStreakActivity(ctx.user.id);

			return updated;
		}),

	// Delete a single plan. Scoped to org + user so a student can only ever
	// remove their own; StudyPlanItem cascades on studyPlanId, so the items go
	// with it and nothing else is touched.
	delete: protectedOrganizationProcedure
		.input(studyPlanIdSchema)
		.mutation(async ({ ctx, input }) => {
			const result = await prisma.studyPlan.deleteMany({
				where: {
					id: input.id,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
			});

			if (result.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Study plan not found",
				});
			}

			return { success: true };
		}),
});
