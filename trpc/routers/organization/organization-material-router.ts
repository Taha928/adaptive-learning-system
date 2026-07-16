import { MaterialStatus, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { indexMaterialChunksSafely } from "@/lib/ai/material-indexing";
import { selectCoverageChunks } from "@/lib/ai/retrieval";
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
	createMaterialSchema,
	listMaterialsSchema,
	materialIdSchema,
	segmentMaterialSchema,
	updateMaterialSchema,
} from "@/schemas/organization-material-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

/** Schema the LLM must satisfy when segmenting material into topics. */
const aiTopicsSchema = z.object({
	topics: z
		.array(
			z.object({
				title: z.string(),
				summary: z.string(),
			}),
		)
		.min(1),
});

/** Only org owners/admins (instructors) may manage materials. */
function assertCanManage(role: string) {
	if (role !== "owner" && role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only instructors can manage materials",
		});
	}
}

/** Verify a course exists within the active organization. */
async function assertCourseInOrg(courseId: string, organizationId: string) {
	const course = await prisma.course.findFirst({
		where: { id: courseId, organizationId },
		select: { id: true },
	});
	if (!course) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
	}
}

export const organizationMaterialRouter = createTRPCRouter({
	list: protectedOrganizationProcedure
		.input(listMaterialsSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.MaterialWhereInput = {
				organizationId: ctx.organization.id,
			};

			if (input.courseId) {
				where.courseId = input.courseId;
			}

			if (input.query) {
				where.title = { contains: input.query, mode: "insensitive" };
			}

			const [materials, total] = await Promise.all([
				prisma.material.findMany({
					where,
					take: input.limit,
					skip: input.offset,
					orderBy: { createdAt: "desc" },
					include: {
						course: { select: { id: true, title: true } },
						uploadedBy: { select: { id: true, name: true, image: true } },
						_count: { select: { topics: true } },
					},
				}),
				prisma.material.count({ where }),
			]);

			return { materials, total };
		}),

	get: protectedOrganizationProcedure
		.input(materialIdSchema)
		.query(async ({ ctx, input }) => {
			const material = await prisma.material.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				include: {
					course: { select: { id: true, title: true } },
					topics: { orderBy: { orderIndex: "asc" } },
				},
			});

			if (!material) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Material not found",
				});
			}

			return material;
		}),

	create: protectedOrganizationProcedure
		.input(createMaterialSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			await assertCourseInOrg(input.courseId, ctx.organization.id);

			const { extractedText, ...rest } = input;

			const material = await prisma.material.create({
				data: {
					...rest,
					extractedText: extractedText || null,
					// If text is already present, the material is ready for AI use.
					status: extractedText
						? MaterialStatus.ready
						: MaterialStatus.uploaded,
					organizationId: ctx.organization.id,
					uploadedById: ctx.user.id,
				},
			});

			// Build the RAG index from the text we just stored. Awaited rather
			// than fire-and-forget because this also runs on serverless, where
			// work outstanding when the response is sent is simply killed.
			// Never throws — see indexMaterialChunksSafely.
			if (extractedText) {
				await indexMaterialChunksSafely({
					materialId: material.id,
					organizationId: ctx.organization.id,
					text: extractedText,
				});
			}

			// Unchanged shape: still the Material, exactly as before.
			return material;
		}),

	update: protectedOrganizationProcedure
		.input(updateMaterialSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const { id, ...data } = input;

			const { updated, previousText } = await prisma.$transaction(
				async (tx) => {
					const existing = await tx.material.findFirst({
						where: { id, organizationId: ctx.organization.id },
						select: { extractedText: true },
					});

					const result = await tx.material.updateMany({
						where: { id, organizationId: ctx.organization.id },
						data,
					});

					if (result.count === 0) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Material not found",
						});
					}

					const updated = await tx.material.findUnique({ where: { id } });
					if (!updated) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to load updated material",
						});
					}
					return { updated, previousText: existing?.extractedText ?? null };
				},
			);

			// Re-index only when the text actually changed. Embeddings are paid
			// for per token, so re-embedding an unchanged document because the
			// title was edited is pure waste — "generate embeddings once" means
			// once per version of the text, not once per save.
			if (
				data.extractedText !== undefined &&
				updated.extractedText !== previousText
			) {
				await indexMaterialChunksSafely({
					materialId: updated.id,
					organizationId: ctx.organization.id,
					text: updated.extractedText,
				});
			}

			// Unchanged shape: still the Material, exactly as before.
			return updated;
		}),

	delete: protectedOrganizationProcedure
		.input(materialIdSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const result = await prisma.material.deleteMany({
				where: { id: input.id, organizationId: ctx.organization.id },
			});

			if (result.count === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Material not found",
				});
			}

			return { success: true };
		}),

	// INSTRUCTOR ONLY: use the AI to split a material's text into topics.
	// Topics are the unit quizzes and study plans are generated from, so this
	// is the bridge between raw uploaded content and the adaptive features.
	segmentTopics: protectedOrganizationProcedure
		.input(segmentMaterialSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);

			const material = await prisma.material.findFirst({
				where: { id: input.id, organizationId: ctx.organization.id },
				select: {
					id: true,
					courseId: true,
					title: true,
					extractedText: true,
				},
			});

			if (!material) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Material not found",
				});
			}

			if (!material.extractedText?.trim()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This material has no text to segment. Upload a PDF or paste notes first.",
				});
			}

			// Segmentation has no query to retrieve against — the whole document is
			// the subject — so it reads an even spread of chunks across the entire
			// material instead. The previous `.slice(0, 16000)` meant a long
			// document's later half was never segmented and its topics silently did
			// not exist.
			const coverage = await selectCoverageChunks({
				organizationId: ctx.organization.id,
				materialId: material.id,
			});
			// Falls back to the old bounded slice only if this material has no
			// chunks and could not be indexed (e.g. the embedding call failed).
			const sourceText =
				coverage.text || material.extractedText.slice(0, 16000);

			try {
				const { object } = await generateObject({
					model: tutorModel(),
					system: TUTOR_SYSTEM_PROMPT,
					schema: aiTopicsSchema,
					prompt: `Split the following study material into at most ${input.maxTopics} distinct learning topics, in the order they should be studied. For each topic give a short title and a 1-2 sentence summary. Use ONLY the material below.

Material "${material.title}":
${sourceText}`,
				});

				// Replace any previously-generated topics for this material so
				// re-running segmentation stays idempotent.
				const created = await prisma.$transaction(async (tx) => {
					await tx.topic.deleteMany({
						where: {
							organizationId: ctx.organization.id,
							materialId: material.id,
						},
					});

					await tx.topic.createMany({
						data: object.topics.map((topic, index) => ({
							organizationId: ctx.organization.id,
							courseId: material.courseId,
							materialId: material.id,
							title: topic.title,
							summary: topic.summary,
							orderIndex: index,
						})),
					});

					await tx.material.update({
						where: { id: material.id },
						data: { status: MaterialStatus.ready },
					});

					return object.topics.length;
				});

				return { success: true, topicsCreated: created };
			} catch (error) {
				logger.error(
					{
						error,
						materialId: material.id,
						organizationId: ctx.organization.id,
					},
					"Failed to segment material into topics",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to segment material. Please try again.",
				});
			}
		}),
});
