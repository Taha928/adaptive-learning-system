import { CourseLevel, CourseStatus } from "@prisma/client";
import { z } from "zod/v4";

// Sortable fields for courses
export const CourseSortField = z.enum([
	"title",
	"subject",
	"level",
	"status",
	"createdAt",
]);
export type CourseSortField = z.infer<typeof CourseSortField>;

// List courses with filters
export const listCoursesSchema = z.object({
	limit: z.number().min(1).max(100).default(50),
	offset: z.number().min(0).default(0),
	query: z.string().optional(),
	sortBy: CourseSortField.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	filters: z
		.object({
			status: z.array(z.nativeEnum(CourseStatus)).optional(),
			level: z.array(z.nativeEnum(CourseLevel)).optional(),
		})
		.optional(),
});

// Create course
export const createCourseSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Title is required")
		.max(200, "Title is too long"),
	description: z
		.string()
		.trim()
		.max(5000, "Description is too long")
		.optional(),
	subject: z.string().trim().max(150, "Subject is too long").optional(),
	level: z.nativeEnum(CourseLevel).default(CourseLevel.beginner),
	status: z.nativeEnum(CourseStatus).default(CourseStatus.draft),
});

// Update course
export const updateCourseSchema = z.object({
	id: z.string().uuid(),
	title: z
		.string()
		.trim()
		.min(1, "Title is required")
		.max(200, "Title is too long")
		.optional(),
	description: z
		.string()
		.trim()
		.max(5000, "Description is too long")
		.optional()
		.nullable(),
	subject: z
		.string()
		.trim()
		.max(150, "Subject is too long")
		.optional()
		.nullable(),
	level: z.nativeEnum(CourseLevel).optional(),
	status: z.nativeEnum(CourseStatus).optional(),
});

// Delete / get by id
export const courseIdSchema = z.object({
	id: z.string().uuid(),
});

// Bulk delete
export const bulkDeleteCoursesSchema = z.object({
	ids: z.array(z.string().uuid()).min(1),
});

// Type exports
export type ListCoursesInput = z.infer<typeof listCoursesSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseIdInput = z.infer<typeof courseIdSchema>;
export type BulkDeleteCoursesInput = z.infer<typeof bulkDeleteCoursesSchema>;
