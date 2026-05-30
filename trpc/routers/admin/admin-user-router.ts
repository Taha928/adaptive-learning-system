import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { appendAnd, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
	banUserAdminSchema,
	exportUsersAdminSchema,
	listUsersAdminSchema,
	unbanUserAdminSchema,
} from "@/schemas/admin-user-schemas";
import { createTRPCRouter, protectedAdminProcedure } from "@/trpc/init";

export const adminUserRouter = createTRPCRouter({
	list: protectedAdminProcedure
		.input(listUsersAdminSchema)
		.query(async ({ input }) => {
			const where: Prisma.UserWhereInput = {};

			if (input.query) {
				where.OR = [
					{ name: { contains: input.query, mode: "insensitive" } },
					{ email: { contains: input.query, mode: "insensitive" } },
				];
			}

			if (input.filters?.role?.length) {
				where.role = { in: input.filters.role };
			}

			if (input.filters?.emailVerified?.length) {
				const ors: Prisma.UserWhereInput[] = [];
				for (const status of input.filters.emailVerified) {
					if (status === "verified") ors.push({ emailVerified: true });
					if (status === "pending") ors.push({ emailVerified: false });
				}
				if (ors.length) {
					appendAnd(where, { OR: ors });
				}
			}

			if (input.filters?.banned?.length) {
				const ors: Prisma.UserWhereInput[] = [];
				for (const status of input.filters.banned) {
					if (status === "banned") ors.push({ banned: true });
					if (status === "active")
						ors.push({ OR: [{ banned: false }, { banned: null }] });
				}
				if (ors.length) {
					appendAnd(where, { OR: ors });
				}
			}

			if (input.filters?.createdAt?.length) {
				const now = new Date();
				const dateOr: Prisma.UserWhereInput[] = [];
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
				if (dateOr.length) {
					appendAnd(where, { OR: dateOr });
				}
			}

			const order = input.sortOrder === "desc" ? "desc" : "asc";
			const orderBy =
				input.sortBy === "name"
					? ({ name: order } as const)
					: input.sortBy === "email"
						? ({ email: order } as const)
						: input.sortBy === "role"
							? ({ role: order } as const)
							: ({ createdAt: order } as const);

			const [users, total] = await Promise.all([
				prisma.user.findMany({
					where,
					take: input.limit,
					skip: input.offset,
					orderBy,
				}),
				prisma.user.count({ where }),
			]);

			return { users, total };
		}),
	exportSelectedToCsv: protectedAdminProcedure
		.input(exportUsersAdminSchema)
		.mutation(async ({ input }) => {
			const users = await prisma.user.findMany({
				where: { id: { in: input.userIds } },
				select: {
					id: true,
					name: true,
					email: true,
					emailVerified: true,
					role: true,
					banned: true,
					onboardingComplete: true,
					twoFactorEnabled: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			const Papa = await import("papaparse");
			const csv = Papa.unparse(users);
			return csv;
		}),
	exportSelectedToExcel: protectedAdminProcedure
		.input(exportUsersAdminSchema)
		.mutation(async ({ input }) => {
			const users = await prisma.user.findMany({
				where: { id: { in: input.userIds } },
				select: {
					id: true,
					name: true,
					email: true,
					emailVerified: true,
					role: true,
					banned: true,
					onboardingComplete: true,
					twoFactorEnabled: true,
					createdAt: true,
					updatedAt: true,
				},
			});
			const ExcelJS = await import("exceljs");
			const workbook = new ExcelJS.Workbook();
			const worksheet = workbook.addWorksheet("Users");

			if (users.length > 0) {
				const columns = [
					{ header: "ID", key: "id", width: 40 },
					{ header: "Name", key: "name", width: 25 },
					{ header: "Email", key: "email", width: 30 },
					{ header: "Email Verified", key: "emailVerified", width: 15 },
					{ header: "Role", key: "role", width: 15 },
					{ header: "Banned", key: "banned", width: 10 },
					{
						header: "Onboarding Complete",
						key: "onboardingComplete",
						width: 20,
					},
					{ header: "2FA Enabled", key: "twoFactorEnabled", width: 15 },
					{ header: "Created At", key: "createdAt", width: 25 },
					{ header: "Updated At", key: "updatedAt", width: 25 },
				];
				worksheet.columns = columns;
				for (const user of users) {
					worksheet.addRow(user);
				}
			}

			const buffer = await workbook.xlsx.writeBuffer();
			const base64 = Buffer.from(buffer).toString("base64");
			return base64;
		}),
	banUser: protectedAdminProcedure
		.input(banUserAdminSchema)
		.mutation(async ({ ctx, input }) => {
			// Check if user exists
			const targetUser = await prisma.user.findUnique({
				where: { id: input.userId },
			});

			if (!targetUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			// Prevent banning yourself
			if (targetUser.id === ctx.user.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You cannot ban yourself",
				});
			}

			// Check if user is already banned
			if (targetUser.banned) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "User is already banned",
				});
			}

			// Update user with ban information
			await prisma.user.update({
				where: { id: input.userId },
				data: {
					banned: true,
					banReason: input.reason,
					banExpires: input.expiresAt || null,
				},
			});

			// Log ban operation for monitoring/debugging
			logger.info(
				{
					action: "user_banned",
					targetUserId: input.userId,
					targetUserEmail: targetUser.email,
					adminUserId: ctx.user.id,
					adminUserEmail: ctx.user.email,
					reason: input.reason,
					expiresAt: input.expiresAt || null,
				},
				"Admin banned user",
			);
		}),
	unbanUser: protectedAdminProcedure
		.input(unbanUserAdminSchema)
		.mutation(async ({ ctx, input }) => {
			// Check if user exists
			const targetUser = await prisma.user.findUnique({
				where: { id: input.userId },
			});

			if (!targetUser) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			// Check if user is not banned
			if (!targetUser.banned) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "User is not banned",
				});
			}

			// Update user to remove ban
			await prisma.user.update({
				where: { id: input.userId },
				data: {
					banned: false,
					banReason: null,
					banExpires: null,
				},
			});

			// Log unban operation for monitoring/debugging
			logger.info(
				{
					action: "user_unbanned",
					targetUserId: input.userId,
					targetUserEmail: targetUser.email,
					adminUserId: ctx.user.id,
					adminUserEmail: ctx.user.email,
					previousBanReason: targetUser.banReason,
				},
				"Admin unbanned user",
			);
		}),
});
