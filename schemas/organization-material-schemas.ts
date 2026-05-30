import { MaterialStatus, MaterialType } from "@prisma/client";
import { z } from "zod/v4";

// List materials (optionally scoped to a course)
export const listMaterialsSchema = z.object({
	courseId: z.string().uuid().optional(),
	limit: z.number().min(1).max(100).default(50),
	offset: z.number().min(0).default(0),
	query: z.string().optional(),
});

// Create material. `extractedText` is the plain text used for AI generation —
// either pasted directly or produced by the PDF extraction endpoint.
export const createMaterialSchema = z.object({
	courseId: z.string().uuid(),
	title: z
		.string()
		.trim()
		.min(1, "Title is required")
		.max(200, "Title is too long"),
	fileType: z.nativeEnum(MaterialType).default(MaterialType.note),
	fileUrl: z.string().url().max(2000).optional(),
	fileSizeBytes: z.number().int().min(0).optional(),
	extractedText: z
		.string()
		.trim()
		.max(500_000, "Content is too long")
		.optional(),
});

// Update material
export const updateMaterialSchema = z.object({
	id: z.string().uuid(),
	title: z.string().trim().min(1).max(200).optional(),
	status: z.nativeEnum(MaterialStatus).optional(),
	extractedText: z
		.string()
		.trim()
		.max(500_000, "Content is too long")
		.optional()
		.nullable(),
});

// Delete / get by id / segment
export const materialIdSchema = z.object({
	id: z.string().uuid(),
});

// AI topic segmentation for a material
export const segmentMaterialSchema = z.object({
	id: z.string().uuid(),
	maxTopics: z.number().int().min(1).max(20).default(6),
});

// Type exports
export type ListMaterialsInput = z.infer<typeof listMaterialsSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type MaterialIdInput = z.infer<typeof materialIdSchema>;
export type SegmentMaterialInput = z.infer<typeof segmentMaterialSchema>;
