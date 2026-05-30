import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { appConfig } from "@/config/app.config";
import { prisma } from "@/lib/db";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

// Chat message schema - matches the format used by ai-chat.tsx and useChat hook
const chatMessageSchema = z.object({
	role: z.enum(["user", "assistant", "system"]),
	content: z.string().max(100000), // Reasonable max length for a message
	isError: z.boolean().optional(),
});

export const organizationAiRouter = createTRPCRouter({
	// List all chats for the organization
	// Note: We only select fields needed for the sidebar list view to avoid
	// loading potentially large message arrays. The full messages are loaded
	// via getChat when a specific chat is selected.
	listChats: protectedOrganizationProcedure
		.input(
			z
				.object({
					limit: z
						.number()
						.min(1)
						.max(appConfig.pagination.maxLimit)
						.optional()
						.default(appConfig.pagination.defaultLimit),
					offset: z.number().min(0).optional().default(0),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const limit = input?.limit ?? 20;
			const offset = input?.offset ?? 0;

			const chats = await prisma.$queryRaw<
				Array<{
					id: string;
					title: string | null;
					pinned: boolean;
					createdAt: Date;
					firstMessageContent: string | null;
				}>
			>`
				SELECT
					id,
					title,
					pinned,
					created_at as "createdAt",
					CASE
						WHEN messages IS NOT NULL
							AND messages::jsonb != '[]'::jsonb
						THEN (messages::jsonb->0->>'content')
						ELSE NULL
					END as "firstMessageContent"
				FROM ai_chat
				WHERE organization_id = ${ctx.organization.id}::uuid
				ORDER BY pinned DESC, created_at DESC
				LIMIT ${limit} OFFSET ${offset}
			`;

			return {
				chats,
			};
		}),

	// Get a single chat by ID
	getChat: protectedOrganizationProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const chat = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (!chat) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			return {
				chat: {
					...chat,
					messages: chat.messages ? JSON.parse(chat.messages) : [],
				},
			};
		}),

	// Create a new chat
	createChat: protectedOrganizationProcedure
		.input(
			z
				.object({
					title: z.string().optional(),
				})
				.optional(),
		)
		.mutation(async ({ ctx, input }) => {
			const chat = await prisma.aiChat.create({
				data: {
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					title: input?.title,
					messages: JSON.stringify([]),
				},
			});

			return {
				chat: {
					...chat,
					messages: [],
				},
			};
		}),

	// Update a chat (title or messages)
	updateChat: protectedOrganizationProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				title: z.string().max(200).optional(),
				messages: z.array(chatMessageSchema).max(1000).optional(), // Max 1000 messages per chat
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existingChat = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (!existingChat) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			const updatedResult = await prisma.aiChat.updateMany({
				where: { id: input.id, organizationId: ctx.organization.id },
				data: {
					title: input.title ?? existingChat.title,
					messages: input.messages
						? JSON.stringify(input.messages)
						: existingChat.messages,
				},
			});

			if (updatedResult.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			const updated = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			return {
				chat: {
					...updated,
					messages: updated.messages ? JSON.parse(updated.messages) : [],
				},
			};
		}),

	// Delete a chat
	deleteChat: protectedOrganizationProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const existingChat = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				select: { id: true },
			});

			if (!existingChat) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			const deleted = await prisma.aiChat.deleteMany({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (deleted.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			return { success: true };
		}),

	// Toggle pin status of a chat
	togglePin: protectedOrganizationProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const existingChat = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				select: { id: true, pinned: true },
			});

			if (!existingChat) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			const updatedResult = await prisma.aiChat.updateMany({
				where: { id: input.id, organizationId: ctx.organization.id },
				data: { pinned: !existingChat.pinned },
			});

			if (updatedResult.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			const updated = await prisma.aiChat.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat not found",
				});
			}

			return {
				chat: updated,
				pinned: updated?.pinned ?? false,
			};
		}),

	// Search chats by title or message content
	searchChats: protectedOrganizationProcedure
		.input(
			z.object({
				query: z.string().min(1).max(100),
				limit: z
					.number()
					.min(1)
					.max(appConfig.pagination.maxLimit)
					.optional()
					.default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const searchPattern = `%${input.query}%`;

			const chats = await prisma.$queryRaw<
				Array<{
					id: string;
					title: string | null;
					pinned: boolean;
					createdAt: Date;
					firstMessageContent: string | null;
				}>
			>`
				SELECT
					id,
					title,
					pinned,
					created_at as "createdAt",
					CASE
						WHEN messages IS NOT NULL
							AND messages::jsonb != '[]'::jsonb
						THEN (messages::jsonb->0->>'content')
						ELSE NULL
					END as "firstMessageContent"
				FROM ai_chat
				WHERE organization_id = ${ctx.organization.id}::uuid
					AND (
						title ILIKE ${searchPattern}
						OR messages::text ILIKE ${searchPattern}
					)
				ORDER BY pinned DESC, created_at DESC
				LIMIT ${input.limit}
			`;

			return { chats };
		}),
});
