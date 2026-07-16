import { QuizDifficulty, QuizPurpose } from "@prisma/client";
import { z } from "zod/v4";

// List quizzes, optionally scoped to a single course.
// Auto-generated adaptive "next" quizzes are hidden unless includeAdaptive.
// `purpose` keeps the Quizzes screen and the Q&A screen from showing each
// other's sets; it defaults to assessment because that is what /quizzes shows.
export const listQuizzesSchema = z.object({
	courseId: z.string().uuid().optional(),
	includeAdaptive: z.boolean().default(false),
	purpose: z.nativeEnum(QuizPurpose).default(QuizPurpose.assessment),
});

// Get a quiz by id (also used by getForAttempt).
export const quizIdSchema = z.object({
	quizId: z.string().uuid(),
});

// Generate an AI quiz from a topic (instructor only).
// Length presets map to: Quick (5), Standard (10), Practice (20).
// `difficulty` applies to Fixed Difficulty mode only — every question is
// generated at that one level. Adaptive assessments ignore it entirely and go
// through generateAdaptive below.
export const generateFromTopicSchema = z.object({
	topicId: z.string().uuid(),
	numQuestions: z.number().int().min(1).max(20).default(5),
	difficulty: z.nativeEnum(QuizDifficulty).optional(),
});

// Generate an adaptive assessment. `topicId: null` scopes the pool to every
// topic in the course, which is what lets the engine adapt topic selection as
// well as difficulty; pinning a topic narrows it to that topic alone.
export const generateAdaptiveSchema = z.object({
	courseId: z.string().uuid(),
	topicId: z.string().uuid().nullable().default(null),
	numQuestions: z.number().int().min(5).max(20).default(10),
});

// Answer one question of an in-progress adaptive assessment. The engine grades
// it, then returns the next question it selects — there is no client-side
// difficulty choice, by design.
export const answerAdaptiveSchema = z.object({
	attemptId: z.string().uuid(),
	questionId: z.string().uuid(),
	selectedOption: z.string().max(2000).optional(),
	responseText: z.string().max(5000).optional(),
	responseImage: z
		.string()
		.startsWith("data:image/")
		.max(12_000_000)
		.optional(),
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
export type GenerateAdaptiveInput = z.infer<typeof generateAdaptiveSchema>;
export type AnswerAdaptiveInput = z.infer<typeof answerAdaptiveSchema>;
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type ListMyAttemptsInput = z.infer<typeof listMyAttemptsSchema>;
export type AttemptIdInput = z.infer<typeof attemptIdSchema>;

// Generate a written revision set spanning a course (or one topic within it).
// `difficulty: "adaptive"` builds all three tiers and lets the engine choose;
// pinning a level builds a single-tier pool, so the same engine still runs and
// still adapts which TOPIC to ask about — it simply has no level to vary.
export const generateCourseQASchema = z.object({
	courseId: z.string().uuid(),
	topicId: z.string().uuid().nullable().default(null),
	numQuestions: z.number().int().min(5).max(20).default(9),
	difficulty: z
		.enum(["adaptive", "easy", "medium", "hard"])
		.default("adaptive"),
});
