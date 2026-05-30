import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { appendAnd, prisma } from "@/lib/db";
import {
	bulkDeleteLeadsSchema,
	bulkUpdateLeadsStatusSchema,
	createLeadSchema,
	deleteLeadSchema,
	exportLeadsSchema,
	listLeadsSchema,
	updateLeadSchema,
} from "@/schemas/organization-lead-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

export const organizationLeadRouter = createTRPCRouter({
	list: protectedOrganizationProcedure
		.input(listLeadsSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.LeadWhereInput = {
				organizationId: ctx.organization.id,
			};

			if (input.query) {
				where.OR = [
					{ firstName: { contains: input.query, mode: "insensitive" } },
					{ lastName: { contains: input.query, mode: "insensitive" } },
					{ email: { contains: input.query, mode: "insensitive" } },
					{ company: { contains: input.query, mode: "insensitive" } },
				];
			}

			if (input.filters?.status && input.filters.status.length > 0) {
				where.status = { in: input.filters.status };
			}

			if (input.filters?.source && input.filters.source.length > 0) {
				where.source = { in: input.filters.source };
			}

			if (input.filters?.createdAt && input.filters.createdAt.length > 0) {
				const now = new Date();
				const dateOr: Prisma.LeadWhereInput[] = [];

				for (const range of input.filters.createdAt) {
					switch (range) {
						case "today": {
							const start = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate(),
							);
							const end = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate() + 1,
							);
							dateOr.push({ createdAt: { gte: start, lt: end } });
							break;
						}
						case "this-week": {
							const weekStart = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate() - now.getDay(),
							);
							dateOr.push({ createdAt: { gte: weekStart } });
							break;
						}
						case "this-month": {
							const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
							dateOr.push({ createdAt: { gte: monthStart } });
							break;
						}
						case "older": {
							const monthAgo = new Date(
								now.getFullYear(),
								now.getMonth() - 1,
								now.getDate(),
							);
							dateOr.push({ createdAt: { lte: monthAgo } });
							break;
						}
					}
				}

				if (dateOr.length > 0) {
					appendAnd(where, { OR: dateOr });
				}
			}

			// Build sort order
			const sortOrder = input.sortOrder === "desc" ? "desc" : "asc";
			const orderBy: Prisma.LeadOrderByWithRelationInput =
				input.sortBy === "name"
					? { firstName: sortOrder }
					: input.sortBy === "company"
						? { company: sortOrder }
						: input.sortBy === "email"
							? { email: sortOrder }
							: input.sortBy === "status"
								? { status: sortOrder }
								: input.sortBy === "source"
									? { source: sortOrder }
									: input.sortBy === "estimatedValue"
										? { estimatedValue: sortOrder }
										: { createdAt: sortOrder };

			// Run leads and count queries in parallel
			const [leads, total] = await Promise.all([
				prisma.lead.findMany({
					where,
					take: input.limit,
					skip: input.offset,
					orderBy,
					include: {
						assignedTo: {
							select: { id: true, name: true, email: true, image: true },
						},
					},
				}),
				prisma.lead.count({ where }),
			]);

			return { leads, total };
		}),

	get: protectedOrganizationProcedure
		.input(deleteLeadSchema)
		.query(async ({ ctx, input }) => {
			const lead = await prisma.lead.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				include: {
					assignedTo: {
						select: { id: true, name: true, email: true, image: true },
					},
				},
			});

			if (!lead) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Lead not found",
				});
			}

			return lead;
		}),

	create: protectedOrganizationProcedure
		.input(createLeadSchema)
		.mutation(async ({ ctx, input }) => {
			return prisma.lead.create({
				data: { ...input, organizationId: ctx.organization.id },
			});
		}),

	update: protectedOrganizationProcedure
		.input(updateLeadSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;

			// Use atomic update with organization check in WHERE clause
			// This prevents TOCTOU race conditions by combining check and update
			return prisma.$transaction(async (tx) => {
				const result = await tx.lead.updateMany({
					where: { id, organizationId: ctx.organization.id },
					data,
				});

				if (result.count === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Lead not found",
					});
				}

				const updated = await tx.lead.findUnique({ where: { id } });
				if (!updated) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to load updated lead",
					});
				}
				return updated;
			});
		}),

	delete: protectedOrganizationProcedure
		.input(deleteLeadSchema)
		.mutation(async ({ ctx, input }) => {
			// Use atomic delete with organization check in WHERE clause
			// This prevents TOCTOU race conditions by combining check and delete
			const result = await prisma.lead.deleteMany({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (result.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Lead not found",
				});
			}

			return { success: true };
		}),

	bulkDelete: protectedOrganizationProcedure
		.input(bulkDeleteLeadsSchema)
		.mutation(async ({ ctx, input }) => {
			// Use returning() to get actual deleted count instead of assuming all IDs existed
			const deleted = await prisma.lead.deleteMany({
				where: { id: { in: input.ids }, organizationId: ctx.organization.id },
			});

			return { success: true, count: deleted.count };
		}),

	bulkUpdateStatus: protectedOrganizationProcedure
		.input(bulkUpdateLeadsStatusSchema)
		.mutation(async ({ ctx, input }) => {
			// Use returning() to get actual updated count instead of assuming all IDs existed
			const updated = await prisma.lead.updateMany({
				where: { id: { in: input.ids }, organizationId: ctx.organization.id },
				data: { status: input.status },
			});

			return { success: true, count: updated.count };
		}),

	exportSelectedToCsv: protectedOrganizationProcedure
		.input(exportLeadsSchema)
		.mutation(async ({ ctx, input }) => {
			// Explicitly select only the columns we want to export
			// Excludes: organizationId (internal), assignedToId (internal reference)
			const leads = await prisma.lead.findMany({
				where: {
					id: { in: input.leadIds },
					organizationId: ctx.organization.id,
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					phone: true,
					company: true,
					jobTitle: true,
					status: true,
					source: true,
					estimatedValue: true,
					notes: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			const Papa = await import("papaparse");
			const csv = Papa.unparse(leads);
			return csv;
		}),

	exportSelectedToExcel: protectedOrganizationProcedure
		.input(exportLeadsSchema)
		.mutation(async ({ ctx, input }) => {
			// Explicitly select only the columns we want to export
			// Excludes: organizationId (internal), assignedToId (internal reference)
			const leads = await prisma.lead.findMany({
				where: {
					id: { in: input.leadIds },
					organizationId: ctx.organization.id,
				},
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					phone: true,
					company: true,
					jobTitle: true,
					status: true,
					source: true,
					estimatedValue: true,
					notes: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			const ExcelJS = await import("exceljs");
			const workbook = new ExcelJS.Workbook();
			const worksheet = workbook.addWorksheet("Leads");

			if (leads.length > 0) {
				const columns = [
					{ header: "ID", key: "id", width: 40 },
					{ header: "First Name", key: "firstName", width: 20 },
					{ header: "Last Name", key: "lastName", width: 20 },
					{ header: "Email", key: "email", width: 30 },
					{ header: "Phone", key: "phone", width: 20 },
					{ header: "Company", key: "company", width: 25 },
					{ header: "Job Title", key: "jobTitle", width: 25 },
					{ header: "Status", key: "status", width: 15 },
					{ header: "Source", key: "source", width: 15 },
					{ header: "Estimated Value", key: "estimatedValue", width: 18 },
					{ header: "Notes", key: "notes", width: 40 },
					{ header: "Created At", key: "createdAt", width: 25 },
					{ header: "Updated At", key: "updatedAt", width: 25 },
				];
				worksheet.columns = columns;
				for (const lead of leads) {
					worksheet.addRow(lead);
				}
			}

			const buffer = await workbook.xlsx.writeBuffer();
			const base64 = Buffer.from(buffer).toString("base64");
			return base64;
		}),
});
