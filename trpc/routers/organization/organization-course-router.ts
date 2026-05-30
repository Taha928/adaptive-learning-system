import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/db";
import {
	bulkDeleteCoursesSchema,
	courseIdSchema,
	createCourseSchema,
	listCoursesSchema,
	updateCourseSchema,
} from "@/schemas/organization-course-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

/** Only org owners/admins (instructors) may manage courses. */
function assertCanManage(role: string) {
	if (role !== "owner" && role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only instructors can manage courses",
		});
	}
}

export const organizationCourseRouter = createTRPCRouter({
	list: protectedOrganizationProcedure
		.input(listCoursesSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.CourseWhereInput = {
				organizationId: ctx.organization.id,
			};

			if (input.query) {
				where.OR = [
					{ title: { contains: input.query, mode: "insensitive" } },
					{ subject: { contains: input.query, mode: "insensitive" } },
					{ description: { contains: input.query, mode: "insensitive" } },
				];
			}

			if (input.filters?.status && input.filters.status.length > 0) {
				where.status = { in: input.filters.status };
			}

			if (input.filters?.level && input.filters.level.length > 0) {
				where.level = { in: input.filters.level };
			}

			const sortOrder = input.sortOrder === "asc" ? "asc" : "desc";
			const orderBy: Prisma.CourseOrderByWithRelationInput =
				input.sortBy === "title"
					? { title: sortOrder }
					: input.sortBy === "subject"
						? { subject: sortOrder }
						: input.sortBy === "level"
							? { level: sortOrder }
							: input.sortBy === "status"
								? { status: sortOrder }
								: { createdAt: sortOrder };

			const [courses, total] = await Promise.all([
				prisma.course.findMany({
					where,
					take: input.limit,
					skip: input.offset,
					orderBy,
					include: {
						createdBy: {
							select: { id: true, name: true, email: true, image: true },
						},
						_count: {
							select: { materials: true, topics: true, quizzes: true },
						},
					},
				}),
				prisma.course.count({ where }),
			]);

			return { courses, total };
		}),

	get: protectedOrganizationProcedure
		.input(courseIdSchema)
		.query(async ({ ctx, input }) => {
			const course = await prisma.course.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				include: {
					createdBy: {
						select: { id: true, name: true, email: true, image: true },
					},
					_count: {
						select: { materials: true, topics: true, quizzes: true },
					},
				},
			});

			if (!course) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
			}

			return course;
		}),

	create: protectedOrganizationProcedure
		.input(createCourseSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			return prisma.course.create({
				data: {
					...input,
					organizationId: ctx.organization.id,
					createdById: ctx.user.id,
				},
			});
		}),

	update: protectedOrganizationProcedure
		.input(updateCourseSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const { id, ...data } = input;

			return prisma.$transaction(async (tx) => {
				const result = await tx.course.updateMany({
					where: { id, organizationId: ctx.organization.id },
					data,
				});

				if (result.count === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Course not found",
					});
				}

				const updated = await tx.course.findUnique({ where: { id } });
				if (!updated) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to load updated course",
					});
				}
				return updated;
			});
		}),

	delete: protectedOrganizationProcedure
		.input(courseIdSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const result = await prisma.course.deleteMany({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (result.count === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
			}

			return { success: true };
		}),

	bulkDelete: protectedOrganizationProcedure
		.input(bulkDeleteCoursesSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const deleted = await prisma.course.deleteMany({
				where: { id: { in: input.ids }, organizationId: ctx.organization.id },
			});

			return { success: true, count: deleted.count };
		}),
});
