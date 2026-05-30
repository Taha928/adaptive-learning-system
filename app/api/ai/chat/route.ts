import { PerformanceEventType } from "@prisma/client";
import { streamText } from "ai";
import { z } from "zod/v4";
import {
	type ChatModelId,
	chatModels,
	DEFAULT_CHAT_MODEL,
} from "@/config/billing.config";
import { assertUserIsOrgMember, getSession } from "@/lib/auth/server";
// Single source of truth for the tutor persona + model so the chat surface
// never drifts from the quiz/study-plan generation surfaces.
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

// Extract allowed model IDs from shared config
const ALLOWED_MODEL_IDS = chatModels.map((m) => m.id);

// Type guard to check if a model is allowed
function isAllowedModel(model: string): model is ChatModelId {
	return ALLOWED_MODEL_IDS.includes(model as ChatModelId);
}

// Input validation schema
const chatRequestSchema = z.object({
	messages: z.array(
		z
			.object({
				role: z.enum(["user", "assistant", "system"]),
				content: z.string().optional(),
			})
			.passthrough(),
	),
	model: z.string().optional(),
	chatId: z.string().uuid().optional(),
	organizationId: z.string().uuid().optional(),
});

// Standard error response helper
function errorResponse(
	error: string,
	message: string,
	status: number,
	details?: Record<string, unknown>,
) {
	return Response.json(
		{ error, message, ...(details && { details }) },
		{ status },
	);
}

/**
 * This is a separate route handler instead of a tRPC procedure because tRPC
 * doesn't support streaming responses. The Vercel AI SDK's `streamText()`
 * returns chunks over time as the LLM generates tokens, which requires raw
 * HTTP streaming (ReadableStream + chunked transfer encoding). tRPC's
 * request/response model and JSON serialization would break this.
 */

export async function POST(req: Request) {
	const session = await getSession();

	if (!session) {
		return errorResponse("unauthorized", "Authentication required", 401);
	}

	// Validate request body
	let messages: { role: "user" | "assistant" | "system"; content: string }[];
	let chatId: string | undefined;
	let organizationId: string | undefined;
	let selectedModel: ChatModelId = DEFAULT_CHAT_MODEL;

	try {
		const body = await req.json();
		const parsed = chatRequestSchema.parse(body);

		chatId = parsed.chatId;
		organizationId = parsed.organizationId;

		// Normalize messages to ensure proper content string for streamText.
		// The frontend might use 'parts' instead of 'content' for multimodal/edit support
		messages = parsed.messages.map((msg) => {
			let content = msg.content ?? "";

			// If content is missing, try to extract from parts (passed through via zod)
			if (!content) {
				const msgAny = msg as unknown as {
					parts?: { type: string; text?: string }[];
				};
				if (Array.isArray(msgAny.parts)) {
					const textPart = msgAny.parts.find((p) => p.type === "text");
					if (textPart?.text) {
						content = textPart.text;
					}
				}
			}

			return {
				role: msg.role,
				content,
			};
		});

		// Validate and set model
		if (parsed.model) {
			if (!isAllowedModel(parsed.model)) {
				return errorResponse(
					"invalid_model",
					`Model '${parsed.model}' is not supported. Allowed models: ${ALLOWED_MODEL_IDS.join(", ")}`,
					400,
					{ allowedModels: ALLOWED_MODEL_IDS },
				);
			}
			selectedModel = parsed.model;
		}
	} catch (error) {
		logger.warn({ error }, "Invalid chat request body");
		return errorResponse("invalid_request", "Invalid request body", 400);
	}

	// Verify user is a member of the organization before allowing access
	// This prevents attackers from accessing other organizations' chats by passing arbitrary organizationId
	if (organizationId) {
		try {
			await assertUserIsOrgMember(organizationId, session.user.id);
		} catch (error) {
			logger.debug(
				{ error, organizationId, userId: session.user.id },
				"AI chat access denied - user not member of organization",
			);
			return errorResponse("forbidden", "Access denied", 403);
		}
	}

	// Verify the chat belongs to the user's organization
	if (chatId && organizationId) {
		const chat = await prisma.aiChat.findFirst({
			where: { id: chatId, organizationId },
			select: { id: true },
		});

		if (!chat) {
			return errorResponse("not_found", "Chat not found", 404);
		}
	}

	// Verify personal chats belong to the authenticated user
	if (chatId && !organizationId) {
		const chat = await prisma.aiChat.findFirst({
			where: { id: chatId, userId: session.user.id, organizationId: null },
			select: { id: true },
		});

		if (!chat) {
			return errorResponse("not_found", "Chat not found", 404);
		}
	}

	const result = streamText({
		model: tutorModel(selectedModel),
		system: TUTOR_SYSTEM_PROMPT,
		messages,
		async onFinish({ text }) {
			// Log the interaction for analytics (SRS R3). Best-effort: a logging
			// failure must never break the chat response.
			if (organizationId) {
				try {
					await prisma.performanceLog.create({
						data: {
							organizationId,
							userId: session.user.id,
							eventType: PerformanceEventType.chatAsked,
						},
					});
				} catch (error) {
					logger.warn(
						{ error, organizationId, userId: session.user.id },
						"Failed to log chatAsked interaction",
					);
				}
			}

			// Save the assistant's response to the database
			if (chatId) {
				const updatedMessages = [
					...messages,
					{
						role: "assistant",
						content: text,
					},
				];

				const where = organizationId
					? { id: chatId, organizationId }
					: { id: chatId, userId: session.user.id, organizationId: null };

				const updated = await prisma.aiChat.updateMany({
					where,
					data: { messages: JSON.stringify(updatedMessages) },
				});

				if (updated.count === 0) {
					logger.warn(
						{ chatId, organizationId, userId: session.user.id },
						"Failed to persist AI chat messages - chat not found or not owned by user/org",
					);
				}
			}
		},
	});

	return result.toTextStreamResponse();
}
