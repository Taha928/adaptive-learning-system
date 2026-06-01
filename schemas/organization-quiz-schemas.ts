import { QuizDifficulty } from "@prisma/client";
import { z } from "zod/v4";

// List quizzes, optionally scoped to a single course.
// Auto-generated adaptive "next" quizzes are hidden unless includeAdaptive.
export const listQuizzesSchema = z.object({
	courseId: z.string().uuid().optional(),
	includeAdaptive: z.boolean().default(false),
});

// Get a quiz by id (also used by getForAttempt).
export const quizIdSchema = z.object({
	quizId: z.string().uuid(),
});

// Generate an AI quiz from a topic (instructor only).
// Length presets map to: Quick (5), Standard (10), Practice (20).
export const generateFromTopicSchema = z.object({
	topicId: z.string().uuid(),
	numQuestions: z.number().int().min(1).max(20).default(5),
	difficulty: z.nativeEnum(QuizDifficulty).optional(),
});

// Start an attempt at a quiz.
export const startAttemptSchema = z.object({
	quizId: z.string().uuid(),
});

// List the current user's attempts (optionally scoped to a course).
export const listMyAttemptsSchema = z.object({
	courseId: z.string().uuid().optional(),
});

// Get a single graded attempt's full result (re-openable review).
export const attemptIdSchema = z.object({
	attemptId: z.string().uuid(),
});

// A single answer submitted as part of an attempt.
// `responseImage` is a data URL (e.g. a photo of a handwritten/diagram answer)
// used for short/long questions — especially maths — and graded by the AI.
export const submitAnswerSchema = z.object({
	questionId: z.string().uuid(),
	selectedOption: z.string().max(2000).optional(),
	responseText: z.string().max(5000).optional(),
	responseImage: z
		.string()
		.startsWith("data:image/")
		.max(12_000_000)
		.optional(),
});

// Submit a full attempt (the adaptive loop).
export const submitAttemptSchema = z.object({
	attemptId: z.string().uuid(),
	answers: z.array(submitAnswerSchema).min(1),
});

// Type exports
export type ListQuizzesInput = z.infer<typeof listQuizzesSchema>;
export type QuizIdInput = z.infer<typeof quizIdSchema>;
export type GenerateFromTopicInput = z.infer<typeof generateFromTopicSchema>;
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type ListMyAttemptsInput = z.infer<typeof listMyAttemptsSchema>;
export type AttemptIdInput = z.infer<typeof attemptIdSchema>;
