import { z } from "zod/v4";

// Identify a single topic.
export const topicIdSchema = z.object({
	topicId: z.string().uuid(),
});

// Generate (or regenerate) the lesson for a topic.
export const generateLessonSchema = z.object({
	topicId: z.string().uuid(),
	// Regenerate even if a lesson is already cached on Topic.content.
	force: z.boolean().default(false),
});
