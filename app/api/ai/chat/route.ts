import { PerformanceEventType } from "@prisma/client";
import { type ModelMessage, streamText } from "ai";
import { z } from "zod/v4";
import {
	type ChatModelId,
	chatModels,
	DEFAULT_CHAT_MODEL,
} from "@/config/billing.config";
// Single source of truth for the tutor persona + model so the chat surface
// never drifts from the quiz/study-plan generation surfaces.
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";
import { assertUserIsOrgMember, getSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordStreakActivity } from "@/lib/streak";

export const maxDuration = 30;

// Extract allowed model IDs from shared config
const ALLOWED_MODEL_IDS = chatModels.map((m) => m.id);

// Type guard to check if a model is allowed
function isAllowedModel(model: string): model is ChatModelId {
	return ALLOWED_MODEL_IDS.includes(model as ChatModelId);
}

// A single file attached to the latest user message. `url` is a data URL
// (`data:<mediaType>;base64,<...>`). We cap the size to keep request bodies sane.
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024; // ~12 MB per file
const attachmentSchema = z.object({
	name: z.string().max(255),
	mediaType: z.string().max(128),
	url: z
		.string()
		.startsWith("data:")
		.max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 1024),
});

export type ChatAttachment = z.infer<typeof attachmentSchema>;

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
	attachments: z.array(attachmentSchema).max(6).optional(),
});

/** Extract the base64 payload from a `data:` URL. */
function dataUrlToBase64(url: string): string {
	const comma = url.indexOf(",");
	return comma === -1 ? "" : url.slice(comma + 1);
}

/**
 * Turn the latest user message into a multimodal content array so the Gemini
 * tutor can actually read attached files:
 *   • images & PDFs are passed through natively (Gemini reads/【OCRs】 them),
 *   • DOCX is converted to text with mammoth,
 *   • plain text is inlined,
 *   • anything else is mentioned by name so the tutor can ask for a better format.
 */
async function buildUserContent(
	text: string,
	attachments: ChatAttachment[],
): Promise<Array<Record<string, unknown>>> {
	const parts: Array<Record<string, unknown>> = [];
	if (text) {
		parts.push({ type: "text", text });
	}

	for (const att of attachments) {
		const mediaType = att.mediaType.toLowerCase();
		try {
			if (mediaType.startsWith("image/")) {
				parts.push({ type: "image", image: att.url });
			} else if (mediaType === "application/pdf") {
				parts.push({
					type: "file",
					data: att.url,
					mediaType: "application/pdf",
				});
			} else if (mediaType.startsWith("text/")) {
				const decoded = Buffer.from(
					dataUrlToBase64(att.url),
					"base64",
				).toString("utf8");
				parts.push({
					type: "text",
					text: `\n\n[Attached file "${att.name}"]:\n${decoded.slice(0, 20_000)}`,
				});
			} else if (
				mediaType ===
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
			) {
				const mammoth = await import("mammoth");
				const buffer = Buffer.from(dataUrlToBase64(att.url), "base64");
				const { value } = await mammoth.extractRawText({ buffer });
				parts.push({
					type: "text",
					text: `\n\n[Attached document "${att.name}"]:\n${value.slice(0, 20_000)}`,
				});
			} else {
				parts.push({
					type: "text",
					text: `\n\n[The student attached "${att.name}" (${att.mediaType}), which can't be read directly. Ask them to share it as a PDF, image, or text if its contents are needed.]`,
				});
			}
		} catch (error) {
			logger.warn(
				{ error, name: att.name, mediaType: att.mediaType },
				"Failed to process chat attachment",
			);
			parts.push({
				type: "text",
				text: `\n\n[Attachment "${att.name}" could not be read.]`,
			});
		}
	}

	return parts;
}

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
	let attachments: ChatAttachment[] = [];

	try {
		const body = await req.json();
		const parsed = chatRequestSchema.parse(body);

		chatId = parsed.chatId;
		organizationId = parsed.organizationId;
		attachments = parsed.attachments ?? [];

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

	// Personalize the tutor: fold the student's currently-weak topics into the
	// system prompt so the chat is adaptive rather than generic.
	let systemPrompt = TUTOR_SYSTEM_PROMPT;
	if (organizationId) {
		try {
			const logs = await prisma.performanceLog.findMany({
				where: {
					organizationId,
					userId: session.user.id,
					topicId: { not: null },
					masteryScore: { not: null },
				},
				orderBy: { occurredAt: "desc" },
				select: {
					topicId: true,
					masteryScore: true,
					topic: { select: { title: true } },
				},
				take: 100,
			});

			const seen = new Set<string>();
			const weakTopics: string[] = [];
			for (const log of logs) {
				if (log.topicId && !seen.has(log.topicId)) {
					seen.add(log.topicId);
					if ((log.masteryScore ?? 0) < 0.6 && log.topic?.title) {
						weakTopics.push(log.topic.title);
					}
				}
			}

			if (weakTopics.length > 0) {
				systemPrompt += `\n\nContext about this student: they are currently weakest on these topics — ${weakTopics
					.slice(0, 8)
					.join(
						", ",
					)}. When relevant, steer your explanations, examples, and practice suggestions toward strengthening these areas.`;
			}
		} catch (error) {
			logger.warn({ error, organizationId }, "Failed to build tutor context");
		}
	}

	// If the latest turn carried attachments, rebuild the final user message as a
	// multimodal content array so Gemini can actually read the files.
	let modelMessages: Array<{
		role: "user" | "assistant" | "system";
		content: string | Array<Record<string, unknown>>;
	}> = messages;

	if (attachments.length > 0) {
		const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
		if (lastUserIndex !== -1) {
			const content = await buildUserContent(
				messages[lastUserIndex]!.content,
				attachments,
			);
			modelMessages = messages.map((m, i) =>
				i === lastUserIndex ? { role: m.role, content } : m,
			);
		}
	}

	const result = streamText({
		model: tutorModel(selectedModel),
		system: systemPrompt,
		messages: modelMessages as unknown as ModelMessage[],
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
				// Count this conversation toward the user's learning streak.
				await recordStreakActivity(session.user.id);
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
