import { QuizDifficulty } from "@prisma/client";
import { z } from "zod/v4";

// List quizzes, optionally scoped to a single course.
export const listQuizzesSchema = z.object({
	courseId: z.string().uuid().optional(),
});

// Get a quiz by id (also used by getForAttempt).
export const quizIdSchema = z.object({
	quizId: z.string().uuid(),
});

// Generate an AI quiz from a topic (instructor only).
export const generateFromTopicSchema = z.object({
	topicId: z.string().uuid(),
	numQuestions: z.number().int().min(1).max(15).default(5),
	difficulty: z.nativeEnum(QuizDifficulty).optional(),
});

// Start an attempt at a quiz.
export const startAttemptSchema = z.object({
	quizId: z.string().uuid(),
});

// A single answer submitted as part of an attempt.
export const submitAnswerSchema = z.object({
	questionId: z.string().uuid(),
	selectedOption: z.string().max(2000).optional(),
	responseText: z.string().max(5000).optional(),
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
