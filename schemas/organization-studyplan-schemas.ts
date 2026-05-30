import { z } from "zod/v4";

// List the current user's study plans (org-scoped server-side).
export const listStudyPlansSchema = z
	.object({
		courseId: z.string().uuid().optional(),
	})
	.optional();

// Get a single study plan by id.
export const studyPlanIdSchema = z.object({
	id: z.string().uuid(),
});

// Generate a new AI study plan for the current user.
export const generatePlanSchema = z.object({
	courseId: z.string().uuid().optional(),
	goal: z.string().trim().max(500, "Goal is too long").optional(),
});

// Mark a single study plan item complete.
export const markItemCompleteSchema = z.object({
	itemId: z.string().uuid(),
});

// Type exports
export type ListStudyPlansInput = z.infer<typeof listStudyPlansSchema>;
export type StudyPlanIdInput = z.infer<typeof studyPlanIdSchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
export type MarkItemCompleteInput = z.infer<typeof markItemCompleteSchema>;
