import {
	AttemptStatus,
	PerformanceEventType,
	type Prisma,
	type PrismaClient,
	QuestionType,
	type QuizDifficulty,
	QuizStatus,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { gradeFreeResponse } from "@/lib/ai/quiz-grading";
import {
	type Difficulty,
	nextDifficulty,
	TUTOR_SYSTEM_PROMPT,
	tutorModel,
	updateMastery,
} from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordStreakActivity } from "@/lib/streak";
import {
	attemptIdSchema,
	generateCourseQASchema,
	generateFromTopicSchema,
	listMyAttemptsSchema,
	listQuizzesSchema,
	quizIdSchema,
	startAttemptSchema,
	submitAttemptSchema,
} from "@/schemas/organization-quiz-schemas";
import { createTRPCRouter, protectedOrganizationProcedure } from "@/trpc/init";

/** Only org owners/admins (instructors) may manage/generate quizzes. */
function assertCanManage(role: string) {
	if (role !== "owner" && role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only instructors can generate or manage quizzes",
		});
	}
}

/** Schema the LLM must satisfy when generating quiz questions (mixed types). */
const aiQuizSchema = z.object({
	title: z.string(),
	questions: z
		.array(
			z.object({
				prompt: z.string(),
				type: z.enum([
					"multipleChoice",
					"trueFalse",
					"shortAnswer",
					"longAnswer",
				]),
				// MCQ: 3-4 options; trueFalse: ["True","False"]; short/long: [].
				// Required (no .default) so OpenAI strict structured-output keeps it
				// in `required` — strict mode rejects schemas with optional keys.
				// The model returns [] for short/long answers (see prompt).
				options: z.array(z.string()).max(6),
				// For short/long answers this is a model answer / rubric used by the AI grader.
				correctAnswer: z.string(),
				explanation: z.string(),
			}),
		)
		.min(1),
});

const AI_TYPE_TO_DB: Record<string, QuestionType> = {
	multipleChoice: QuestionType.multipleChoice,
	trueFalse: QuestionType.trueFalse,
	shortAnswer: QuestionType.shortAnswer,
	longAnswer: QuestionType.longAnswer,
};

type TopicForGeneration = {
	id: string;
	courseId: string;
	title: string;
	summary: string | null;
	content: string | null;
	material: { extractedText: string | null } | null;
};

/**
 * Core generation routine reused by both the instructor-triggered
 * `generateFromTopic` mutation and the adaptive loop inside `submitAttempt`.
 * Generates an AI quiz for a topic at a chosen difficulty and persists the
 * Quiz + Question[] in a single transaction. Always org-scoped.
 */
async function generateQuizForTopic(params: {
	tx: Prisma.TransactionClient | PrismaClient;
	organizationId: string;
	createdById: string | null;
	topic: TopicForGeneration;
	numQuestions: number;
	difficulty: Difficulty;
}): Promise<string> {
	const { tx, organizationId, createdById, topic, numQuestions, difficulty } =
		params;

	const sourceParts = [
		topic.summary,
		topic.content,
		topic.material?.extractedText,
	].filter((part): part is string => Boolean(part?.trim()));

	// Keep the prompt bounded so we never blow past model context limits.
	const sourceText = sourceParts.join("\n\n").slice(0, 12000);

	// Longer quizzes get richer free-response questions; quick ones stay snappy.
	const includeLong = numQuestions >= 10;

	const prompt = `Create a ${difficulty} difficulty quiz with exactly ${numQuestions} questions for the topic "${topic.title}".

Use ONLY the study material below as the source of truth. Mix the question types:
- Most should be "multipleChoice" with 3-4 options.
- Include 1-2 "trueFalse" questions whose options are exactly ["True","False"].
- Include 1 "shortAnswer" question with an empty options array and a short (1-3 word) correctAnswer.${
		includeLong
			? `\n- Include 1 "longAnswer" scenario-based question with an empty options array. Its prompt should pose a realistic scenario or problem requiring a short paragraph of reasoning; set "correctAnswer" to a concise model answer / marking rubric describing what a correct response must contain.`
			: ""
	}
For multipleChoice and trueFalse, the "correctAnswer" MUST exactly match one of the provided options. Provide a short explanation for each answer.

Study material:
${sourceText || "(No additional material provided. Generate questions based on the topic title.)"}`;

	const { object } = await generateObject({
		model: tutorModel(),
		system: TUTOR_SYSTEM_PROMPT,
		schema: aiQuizSchema,
		prompt,
	});

	const dbDifficulty = difficulty as QuizDifficulty;

	const quiz = await tx.quiz.create({
		data: {
			organizationId,
			courseId: topic.courseId,
			topicId: topic.id,
			createdById,
			title: object.title || `${topic.title} — ${difficulty} quiz`,
			description: `AI-generated ${difficulty} quiz for ${topic.title}.`,
			difficulty: dbDifficulty,
			isAiGenerated: true,
			status: QuizStatus.published,
			questions: {
				create: object.questions.map((q, index) => ({
					organizationId,
					prompt: q.prompt,
					type: AI_TYPE_TO_DB[q.type] ?? QuestionType.multipleChoice,
					options:
						q.type === "shortAnswer" ||
						q.type === "longAnswer" ||
						q.options.length === 0
							? undefined
							: (q.options as Prisma.InputJsonValue),
					correctAnswer: q.correctAnswer,
					explanation: q.explanation,
					points: 1,
					orderIndex: index,
				})),
			},
		},
		select: { id: true },
	});

	return quiz.id;
}

/**
 * Schema for the written Q&A set. Deliberately NOT `aiQuizSchema`: there are no
 * options and no multiple choice — every question is answered by typing, so the
 * AI grader does the marking and the student has to produce the idea rather
 * than recognise it.
 *
 * `difficulty` and `topicTitle` are per question. Neither has a column on
 * Question, so they are folded into the stored prompt rather than migrated —
 * see buildQaPrompt below.
 */
const aiQaSchema = z.object({
	title: z.string(),
	questions: z
		.array(
			z.object({
				topicTitle: z
					.string()
					.describe("Exact title of the topic this question comes from"),
				difficulty: z.enum(["easy", "medium", "hard"]),
				type: z.enum(["shortAnswer", "longAnswer"]),
				prompt: z
					.string()
					.describe("The question itself, with no topic or difficulty prefix"),
				correctAnswer: z
					.string()
					.describe(
						"A model answer / marking rubric describing what a correct response must contain",
					),
				explanation: z
					.string()
					.describe("Why that is the answer — this is where the student learns"),
			}),
		)
		.min(1),
});

const QA_DIFFICULTY_ORDER: Record<string, number> = {
	easy: 0,
	medium: 1,
	hard: 2,
};

/** Human label folded into the prompt, since Question has no difficulty column. */
function buildQaPrompt(q: {
	difficulty: string;
	topicTitle: string;
	prompt: string;
}): string {
	const level = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);
	return `[${level} · ${q.topicTitle}]\n\n${q.prompt}`;
}

/**
 * Build a written Q&A set spanning EVERY topic in a course.
 *
 * Persisted as a normal Quiz with `topicId: null`, so the existing engine —
 * attempts, AI grading of free responses, the review screen — applies
 * unchanged, and `submitAttempt` correctly skips the per-topic mastery update
 * and adaptive follow-up (this practises a whole course, not one topic).
 *
 * Adaptivity here is the ramp WITHIN the set: easy questions first, then
 * medium, then hard, so the student warms up before being stretched. A student
 * who wants to drill one level can pin the difficulty instead.
 */
async function generateCourseQA(params: {
	organizationId: string;
	createdById: string | null;
	courseId: string;
	courseTitle: string;
	topics: { title: string; summary: string | null }[];
	numQuestions: number;
	difficulty: "adaptive" | "easy" | "medium" | "hard";
}): Promise<{ quizId: string; questionCount: number }> {
	const {
		organizationId,
		createdById,
		courseId,
		courseTitle,
		topics,
		numQuestions,
		difficulty,
	} = params;

	// One block per topic, bounded overall so we stay inside the context budget
	// however many topics the course has.
	const perTopicBudget = Math.max(
		400,
		Math.floor(12000 / Math.max(topics.length, 1)),
	);
	const topicBlocks = topics
		.map((t, i) =>
			[
				`Topic ${i + 1}: ${t.title}`,
				(t.summary ?? "").slice(0, perTopicBudget),
			]
				.join("\n")
				.trim(),
		)
		.join("\n\n");

	const adaptive = difficulty === "adaptive";
	const easyN = Math.ceil(numQuestions / 3);
	const mediumN = Math.ceil((numQuestions - easyN) / 2);
	const hardN = numQuestions - easyN - mediumN;

	const difficultyRule = adaptive
		? [
				"DIFFICULTY RAMP: the set must build up.",
				`- Exactly ${easyN} question(s) with difficulty "easy" — recall and definitions.`,
				`- Exactly ${mediumN} question(s) with difficulty "medium" — apply the idea or explain why.`,
				`- Exactly ${hardN} question(s) with difficulty "hard" — analyse, compare, or reason about a scenario.`,
				`That is ${easyN} + ${mediumN} + ${hardN} = ${numQuestions} questions.`,
				"Return them in that order: all easy, then all medium, then all hard.",
			].join("\n")
		: `DIFFICULTY: all ${numQuestions} questions must be "${difficulty}". Do not vary it.`;

	const prompt = `Create a WRITTEN Q&A practice set for the course "${courseTitle}" containing EXACTLY ${numQuestions} questions.

The count is not a suggestion: the questions array must have exactly ${numQuestions} entries — no fewer, no more.

Every question is answered by typing — there is NO multiple choice, no true/false, and no options. Use type "shortAnswer" for a phrase-or-sentence answer and "longAnswer" where the student should reason in a short paragraph. Ask questions that make the student explain, apply or justify, not just name.

COVERAGE IS MANDATORY: the ${numQuestions} questions must together cover ALL ${topics.length} topics below, spread as evenly as the count allows. Do not skip a topic and do not over-weight one. Set topicTitle to the topic's exact title. Between them, the questions should touch the core concepts of the material rather than clustering on one corner of it.

${difficultyRule}

Use ONLY the material below as the source of truth. For every question set correctAnswer to a model answer / rubric saying what a correct response must contain — the AI grader marks the student's typing against it — and give an explanation the student can learn from.

Topics:
${topicBlocks}

Reminder: return exactly ${numQuestions} questions.`;

	// The student picked the question count, so it has to hold. OpenAI strict
	// structured output ignores array length constraints (minItems/maxItems are
	// unsupported keywords), so the schema cannot enforce this — the model
	// routinely returns one short. Ask once, and retry once if the count is
	// wrong; a surplus we can simply trim.
	let object = (
		await generateObject({
			model: tutorModel(),
			system: TUTOR_SYSTEM_PROMPT,
			schema: aiQaSchema,
			prompt,
		})
	).object;

	if (object.questions.length < numQuestions) {
		logger.warn(
			{ asked: numQuestions, got: object.questions.length, courseId },
			"Q&A generation returned the wrong count; retrying once",
		);
		const retry = await generateObject({
			model: tutorModel(),
			system: TUTOR_SYSTEM_PROMPT,
			schema: aiQaSchema,
			prompt: `${prompt}\n\nYour previous attempt returned ${object.questions.length} questions. That was wrong. Return exactly ${numQuestions}.`,
		});
		// Keep whichever attempt is closer to what the student asked for.
		if (retry.object.questions.length > object.questions.length) {
			object = retry.object;
		}
	}

	// Enforce the ramp ourselves rather than trusting the model to order it.
	const sorted = adaptive
		? [...object.questions].sort(
				(a, b) =>
					(QA_DIFFICULTY_ORDER[a.difficulty] ?? 0) -
					(QA_DIFFICULTY_ORDER[b.difficulty] ?? 0),
			)
		: object.questions;

	// Trim a surplus. A shortfall we cannot invent, so the caller reports the
	// real count rather than the requested one.
	const ordered = sorted.slice(0, numQuestions);

	// The Quiz row carries one difficulty; for a ramped set the honest summary
	// is "medium", since it spans all three.
	const quizDifficulty = (adaptive ? "medium" : difficulty) as QuizDifficulty;

	const quiz = await prisma.quiz.create({
		data: {
			organizationId,
			courseId,
			topicId: null,
			createdById,
			title: object.title || `Q&A — ${courseTitle}`,
			description: adaptive
				? `Written Q&A across all ${topics.length} topics in ${courseTitle}, ramping easy → medium → hard.`
				: `Written ${difficulty} Q&A across all ${topics.length} topics in ${courseTitle}.`,
			difficulty: quizDifficulty,
			isAiGenerated: true,
			status: QuizStatus.published,
			questions: {
				create: ordered.map((q, index) => ({
					organizationId,
					prompt: buildQaPrompt(q),
					type:
						q.type === "longAnswer"
							? QuestionType.longAnswer
							: QuestionType.shortAnswer,
					// Written answers carry no options.
					options: undefined,
					correctAnswer: q.correctAnswer,
					explanation: q.explanation,
					points: 1,
					orderIndex: index,
				})),
			},
		},
		select: { id: true },
	});

	return { quizId: quiz.id, questionCount: ordered.length };
}

/** Load a topic (org-scoped) with the fields needed for generation. */
async function loadTopicForGeneration(
	client: Prisma.TransactionClient | PrismaClient,
	topicId: string,
	organizationId: string,
): Promise<TopicForGeneration> {
	const topic = await client.topic.findFirst({
		where: { id: topicId, organizationId },
		select: {
			id: true,
			courseId: true,
			title: true,
			summary: true,
			content: true,
			material: { select: { extractedText: true } },
		},
	});

	if (!topic) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });
	}

	return topic;
}

export const organizationQuizRouter = createTRPCRouter({
	// List quizzes, optionally for one course, with question/attempt counts.
	list: protectedOrganizationProcedure
		.input(listQuizzesSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.QuizWhereInput = {
				organizationId: ctx.organization.id,
			};
			if (input.courseId) {
				where.courseId = input.courseId;
			}
			// Hide auto-generated adaptive quizzes (createdById null) by default so
			// the list stays focused on instructor-authored quizzes.
			if (!input.includeAdaptive) {
				where.createdById = { not: null };
			}

			const quizzes = await prisma.quiz.findMany({
				where,
				orderBy: { createdAt: "desc" },
				include: {
					course: { select: { id: true, title: true } },
					topic: { select: { id: true, title: true } },
					_count: { select: { questions: true, attempts: true } },
					// The current user's best graded attempt, to show status inline.
					attempts: {
						where: { userId: ctx.user.id, status: AttemptStatus.graded },
						orderBy: { percentage: "desc" },
						take: 1,
						select: { id: true, percentage: true, passed: true },
					},
				},
			});

			return { quizzes };
		}),

	// List topics (org-scoped) for the "generate quiz from topic" picker.
	listTopics: protectedOrganizationProcedure
		.input(listQuizzesSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.TopicWhereInput = {
				organizationId: ctx.organization.id,
			};
			if (input.courseId) {
				where.courseId = input.courseId;
			}

			const topics = await prisma.topic.findMany({
				where,
				orderBy: [{ courseId: "asc" }, { orderIndex: "asc" }],
				select: {
					id: true,
					title: true,
					summary: true,
					courseId: true,
					course: { select: { id: true, title: true } },
					_count: { select: { quizzes: true } },
				},
			});

			return { topics };
		}),

	// Get a quiz with ordered questions (instructor/management view — includes
	// correctAnswer and explanation).
	get: protectedOrganizationProcedure
		.input(quizIdSchema)
		.query(async ({ ctx, input }) => {
			const quiz = await prisma.quiz.findFirst({
				where: { id: input.quizId, organizationId: ctx.organization.id },
				include: {
					course: { select: { id: true, title: true } },
					topic: { select: { id: true, title: true } },
					questions: { orderBy: { orderIndex: "asc" } },
					_count: { select: { questions: true, attempts: true } },
				},
			});

			if (!quiz) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			return quiz;
		}),

	// Get a quiz for a student to take — DOES NOT leak correctAnswer/explanation.
	getForAttempt: protectedOrganizationProcedure
		.input(quizIdSchema)
		.query(async ({ ctx, input }) => {
			const quiz = await prisma.quiz.findFirst({
				where: { id: input.quizId, organizationId: ctx.organization.id },
				select: {
					id: true,
					courseId: true,
					topicId: true,
					title: true,
					description: true,
					difficulty: true,
					passingScore: true,
					timeLimitMinutes: true,
					status: true,
					course: { select: { id: true, title: true } },
					topic: { select: { id: true, title: true } },
					questions: {
						orderBy: { orderIndex: "asc" },
						select: {
							id: true,
							prompt: true,
							type: true,
							options: true,
							points: true,
							orderIndex: true,
						},
					},
				},
			});

			if (!quiz) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			return quiz;
		}),

	// List the current user's graded attempts (their quiz history).
	listMyAttempts: protectedOrganizationProcedure
		.input(listMyAttemptsSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.QuizAttemptWhereInput = {
				organizationId: ctx.organization.id,
				userId: ctx.user.id,
				status: AttemptStatus.graded,
			};
			if (input.courseId) {
				where.courseId = input.courseId;
			}

			const attempts = await prisma.quizAttempt.findMany({
				where,
				orderBy: { submittedAt: "desc" },
				select: {
					id: true,
					score: true,
					maxScore: true,
					percentage: true,
					passed: true,
					submittedAt: true,
					quiz: {
						select: {
							id: true,
							title: true,
							difficulty: true,
							course: { select: { id: true, title: true } },
							topic: { select: { id: true, title: true } },
						},
					},
				},
			});

			return { attempts };
		}),

	// Re-open a single graded attempt with its full per-question review.
	getAttemptResult: protectedOrganizationProcedure
		.input(attemptIdSchema)
		.query(async ({ ctx, input }) => {
			const attempt = await prisma.quizAttempt.findFirst({
				where: {
					id: input.attemptId,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
				select: {
					id: true,
					score: true,
					maxScore: true,
					percentage: true,
					passed: true,
					submittedAt: true,
					quiz: {
						select: {
							id: true,
							title: true,
							difficulty: true,
							questions: {
								orderBy: { orderIndex: "asc" },
								select: {
									id: true,
									prompt: true,
									options: true,
									correctAnswer: true,
									explanation: true,
								},
							},
						},
					},
					answers: {
						select: {
							questionId: true,
							selectedOption: true,
							responseText: true,
							responseImage: true,
							isCorrect: true,
							aiFeedback: true,
						},
					},
				},
			});

			if (!attempt) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Attempt not found",
				});
			}

			const answerByQuestion = new Map(
				attempt.answers.map((a) => [a.questionId, a]),
			);

			const results = attempt.quiz.questions.map((q) => {
				const a = answerByQuestion.get(q.id);
				return {
					questionId: q.id,
					prompt: q.prompt,
					options: Array.isArray(q.options)
						? (q.options as unknown[]).filter(
								(o): o is string => typeof o === "string",
							)
						: [],
					yourAnswer:
						a?.selectedOption ??
						a?.responseText ??
						(a?.responseImage ? "[Image answer]" : null),
					correctAnswer: q.correctAnswer,
					explanation: q.explanation,
					isCorrect: a?.isCorrect ?? false,
					aiFeedback: a?.aiFeedback ?? null,
				};
			});

			return {
				id: attempt.id,
				quizId: attempt.quiz.id,
				title: attempt.quiz.title,
				difficulty: attempt.quiz.difficulty,
				score: attempt.score,
				maxScore: attempt.maxScore,
				percentage: attempt.percentage ?? 0,
				passed: attempt.passed,
				submittedAt: attempt.submittedAt,
				results,
			};
		}),

	// INSTRUCTOR ONLY: generate an AI quiz from a topic's material.
	// Delete a quiz. Instructor-only, mirroring course.delete. Question,
	// QuizAttempt and Answer all cascade from Quiz, so one deleteMany is enough
	// and nothing outside this quiz is touched.
	delete: protectedOrganizationProcedure
		.input(quizIdSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);
			const result = await prisma.quiz.deleteMany({
				where: { id: input.quizId, organizationId: ctx.organization.id },
			});

			if (result.count === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			return { success: true };
		}),

	// Delete one of the current user's own attempts. Scoped to userId as well as
	// the org so a student can never remove someone else's history. Answers
	// cascade from QuizAttempt; the quiz itself is left alone.
	deleteAttempt: protectedOrganizationProcedure
		.input(attemptIdSchema)
		.mutation(async ({ ctx, input }) => {
			const result = await prisma.quizAttempt.deleteMany({
				where: {
					id: input.attemptId,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
			});

			if (result.count === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found" });
			}

			return { success: true };
		}),

	// Build a Q&A practice set covering every topic in a course. Deliberately
	// NOT instructor-gated: this is a student practising, not authoring content.
	generateCourseQA: protectedOrganizationProcedure
		.input(generateCourseQASchema)
		.mutation(async ({ ctx, input }) => {
			const course = await prisma.course.findFirst({
				where: { id: input.courseId, organizationId: ctx.organization.id },
				select: { id: true, title: true },
			});

			if (!course) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
			}

			const topics = await prisma.topic.findMany({
				where: { courseId: course.id, organizationId: ctx.organization.id },
				orderBy: { orderIndex: "asc" },
				select: { title: true, summary: true },
			});

			if (topics.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This course has no topics yet. Generate topics from a material first.",
				});
			}

			try {
				const { quizId, questionCount } = await generateCourseQA({
					organizationId: ctx.organization.id,
					createdById: ctx.user.id,
					courseId: course.id,
					courseTitle: course.title,
					topics,
					numQuestions: input.numQuestions,
					difficulty: input.difficulty,
				});

				return {
					quizId,
					topicCount: topics.length,
					// The count actually produced, not the count requested.
					numQuestions: questionCount,
				};
			} catch (error) {
				logger.error(
					{ error, courseId: course.id, organizationId: ctx.organization.id },
					"Failed to generate course Q&A",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not build the Q&A set. Please try again.",
				});
			}
		}),

	generateFromTopic: protectedOrganizationProcedure
		.input(generateFromTopicSchema)
		.mutation(async ({ ctx, input }) => {
			assertCanManage(ctx.membership.role);

			const topic = await loadTopicForGeneration(
				prisma,
				input.topicId,
				ctx.organization.id,
			);

			const difficulty: Difficulty =
				(input.difficulty as Difficulty | undefined) ?? "medium";

			try {
				// No $transaction: the slow LLM call must not run inside one (5s
				// interactive-tx timeout). The nested quiz+questions create is
				// atomic on its own.
				const quizId = await generateQuizForTopic({
					tx: prisma,
					organizationId: ctx.organization.id,
					createdById: ctx.user.id,
					topic,
					numQuestions: input.numQuestions,
					difficulty,
				});

				return { quizId };
			} catch (error) {
				logger.error(
					{
						error,
						topicId: input.topicId,
						organizationId: ctx.organization.id,
					},
					"Failed to generate quiz from topic",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to generate quiz. Please try again.",
				});
			}
		}),

	// Start an attempt: create the QuizAttempt + a quizStarted PerformanceLog.
	// Returns the attempt and questions WITHOUT answers.
	startAttempt: protectedOrganizationProcedure
		.input(startAttemptSchema)
		.mutation(async ({ ctx, input }) => {
			const quiz = await prisma.quiz.findFirst({
				where: { id: input.quizId, organizationId: ctx.organization.id },
				select: {
					id: true,
					courseId: true,
					title: true,
					questions: {
						orderBy: { orderIndex: "asc" },
						select: {
							id: true,
							prompt: true,
							type: true,
							options: true,
							points: true,
							orderIndex: true,
						},
					},
				},
			});

			if (!quiz) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			if (quiz.questions.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This quiz has no questions yet",
				});
			}

			const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);

			const attempt = await prisma.$transaction(async (tx) => {
				const created = await tx.quizAttempt.create({
					data: {
						organizationId: ctx.organization.id,
						quizId: quiz.id,
						userId: ctx.user.id,
						courseId: quiz.courseId,
						maxScore,
						status: AttemptStatus.inProgress,
					},
					select: { id: true, maxScore: true, status: true, startedAt: true },
				});

				await tx.performanceLog.create({
					data: {
						organizationId: ctx.organization.id,
						userId: ctx.user.id,
						courseId: quiz.courseId,
						quizAttemptId: created.id,
						eventType: PerformanceEventType.quizStarted,
					},
				});

				return created;
			});

			return { attempt, questions: quiz.questions };
		}),

	// THE ADAPTIVE LOOP.
	submitAttempt: protectedOrganizationProcedure
		.input(submitAttemptSchema)
		.mutation(async ({ ctx, input }) => {
			// Load the attempt (org + user scoped) along with its quiz + questions.
			const attempt = await prisma.quizAttempt.findFirst({
				where: {
					id: input.attemptId,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
				include: {
					quiz: {
						select: {
							id: true,
							courseId: true,
							topicId: true,
							difficulty: true,
							passingScore: true,
							topic: { select: { id: true, title: true } },
							questions: {
								orderBy: { orderIndex: "asc" },
								select: {
									id: true,
									type: true,
									prompt: true,
									options: true,
									explanation: true,
									correctAnswer: true,
									points: true,
								},
							},
						},
					},
				},
			});

			if (!attempt) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Attempt not found",
				});
			}

			if (attempt.status === AttemptStatus.graded) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This attempt has already been submitted",
				});
			}

			const questions = attempt.quiz.questions;
			const answerByQuestion = new Map(
				input.answers.map((a) => [a.questionId, a]),
			);

			// Pre-grade free-response answers (short/long/image) with the AI BEFORE
			// opening the grading transaction. AI calls are slow and must never be
			// held inside a DB transaction. Runs all such questions in parallel.
			const aiGrades = new Map<
				string,
				{ isCorrect: boolean; feedback: string }
			>();
			await Promise.all(
				questions
					.filter(
						(q) =>
							q.type === QuestionType.shortAnswer ||
							q.type === QuestionType.longAnswer,
					)
					.map(async (q) => {
						const submitted = answerByQuestion.get(q.id);
						try {
							const grade = await gradeFreeResponse({
								prompt: q.prompt,
								correctAnswer: q.correctAnswer,
								responseText: submitted?.responseText ?? null,
								responseImage: submitted?.responseImage ?? null,
								isLong: q.type === QuestionType.longAnswer,
							});
							aiGrades.set(q.id, grade);
						} catch (error) {
							logger.error(
								{ error, questionId: q.id },
								"AI grading failed; falling back to string match",
							);
						}
					}),
			);

			// Per-question review detail, returned after grading (safe to reveal
			// correct answers + explanations once the attempt is submitted).
			const reviewResults: {
				questionId: string;
				prompt: string;
				options: string[];
				yourAnswer: string | null;
				correctAnswer: string;
				explanation: string | null;
				isCorrect: boolean;
				aiFeedback?: string | null;
			}[] = [];

			// Grade in a transaction: write Answer[], update attempt, log mastery.
			const graded = await prisma.$transaction(async (tx) => {
				let score = 0;

				for (const question of questions) {
					const submitted = answerByQuestion.get(question.id);
					const selectedOption = submitted?.selectedOption ?? null;
					const responseText = submitted?.responseText ?? null;
					const responseImage = submitted?.responseImage ?? null;

					const isFreeResponse =
						question.type === QuestionType.shortAnswer ||
						question.type === QuestionType.longAnswer;

					let isCorrect: boolean;
					let aiFeedback: string | null = null;
					let yourAnswer: string | null;

					if (isFreeResponse) {
						// Use the AI grade computed before the transaction.
						const aiGrade = aiGrades.get(question.id);
						if (aiGrade) {
							isCorrect = aiGrade.isCorrect;
							aiFeedback = aiGrade.feedback;
						} else {
							// AI grading was unavailable even after a retry. Don't silently
							// zero a real answer: keep the cheap exact-match for short
							// answers, but for long answers and image-only submissions
							// (which can't be string-matched) give the benefit of the doubt
							// and flag that it wasn't auto-graded, rather than penalising the
							// student for our outage.
							const hasAnswer = !!(responseText?.trim() || responseImage);
							if (
								question.type === QuestionType.shortAnswer &&
								responseText != null
							) {
								isCorrect =
									responseText.trim().toLowerCase() ===
									question.correctAnswer.trim().toLowerCase();
							} else if (hasAnswer) {
								isCorrect = true;
								aiFeedback =
									"Automatic grading was temporarily unavailable, so this answer was marked as complete — compare it with the model answer to check yourself.";
							} else {
								isCorrect = false;
							}
						}
						yourAnswer =
							responseText ?? (responseImage ? "[Image answer]" : null);
					} else {
						// MCQ / true-false: only the selected option is graded. Free-typed
						// responseText is ignored here so a client cannot submit an answer
						// that was never one of the presented options.
						const candidate = selectedOption;
						isCorrect =
							candidate != null &&
							candidate.trim().toLowerCase() ===
								question.correctAnswer.trim().toLowerCase();
						yourAnswer = candidate;
					}

					const pointsAwarded = isCorrect ? question.points : 0;
					score += pointsAwarded;

					reviewResults.push({
						questionId: question.id,
						prompt: question.prompt,
						options: Array.isArray(question.options)
							? (question.options as unknown[]).filter(
									(o): o is string => typeof o === "string",
								)
							: [],
						yourAnswer,
						correctAnswer: question.correctAnswer,
						explanation: question.explanation,
						isCorrect,
						aiFeedback,
					});

					await tx.answer.upsert({
						where: {
							attemptId_questionId: {
								attemptId: attempt.id,
								questionId: question.id,
							},
						},
						create: {
							organizationId: ctx.organization.id,
							attemptId: attempt.id,
							questionId: question.id,
							userId: ctx.user.id,
							selectedOption,
							responseText,
							responseImage,
							isCorrect,
							pointsAwarded,
							aiFeedback,
						},
						update: {
							selectedOption,
							responseText,
							responseImage,
							isCorrect,
							pointsAwarded,
							aiFeedback,
						},
					});
				}

				const maxScore = attempt.maxScore || 1;
				const percentage = Number(((score / maxScore) * 100).toFixed(2));
				const passed = percentage >= attempt.quiz.passingScore;
				const submittedAt = new Date();
				const durationSeconds = Math.max(
					0,
					Math.round(
						(submittedAt.getTime() - attempt.startedAt.getTime()) / 1000,
					),
				);

				const updatedAttempt = await tx.quizAttempt.update({
					where: { id: attempt.id },
					data: {
						score,
						percentage,
						passed,
						status: AttemptStatus.graded,
						submittedAt,
						durationSeconds,
					},
					select: {
						id: true,
						score: true,
						maxScore: true,
						percentage: true,
						passed: true,
						status: true,
						submittedAt: true,
					},
				});

				// Adaptive mastery update via EMA over the topic.
				const fraction = score / maxScore;
				const topicId = attempt.quiz.topicId;

				let previousMastery: number | null = null;
				if (topicId) {
					const lastLog = await tx.performanceLog.findFirst({
						where: {
							organizationId: ctx.organization.id,
							userId: ctx.user.id,
							topicId,
							masteryScore: { not: null },
						},
						orderBy: { occurredAt: "desc" },
						select: { masteryScore: true },
					});
					previousMastery = lastLog?.masteryScore ?? null;
				}

				const newMastery = updateMastery(previousMastery, fraction);
				const previousDifficulty = nextDifficulty(
					previousMastery ?? newMastery,
				);
				const difficulty = nextDifficulty(newMastery);

				await tx.performanceLog.create({
					data: {
						organizationId: ctx.organization.id,
						userId: ctx.user.id,
						courseId: attempt.quiz.courseId,
						topicId: topicId ?? undefined,
						quizAttemptId: attempt.id,
						eventType: PerformanceEventType.quizCompleted,
						masteryScore: newMastery,
						durationSeconds,
					},
				});

				return {
					updatedAttempt,
					percentage,
					passed,
					score,
					newMastery,
					difficulty,
					difficultyChanged:
						previousMastery != null && previousDifficulty !== difficulty,
					topicId,
				};
			});

			// Completing a quiz counts toward the learning streak.
			await recordStreakActivity(ctx.user.id);

			// A topic is MASTERED once the student clears a hard quiz at or above
			// this score. Reaching it ends the adaptive ladder for the topic:
			// without this the loop is unbounded, because nextDifficulty() keeps
			// returning "hard" for any mastery >= 0.8 and every submission minted
			// another quiz forever.
			const MASTERY_SCORE = 80;
			const mastered =
				attempt.quiz.difficulty === "hard" && graded.percentage >= MASTERY_SCORE;

			// Generate the NEXT adaptive quiz at the new difficulty (best-effort).
			// Done outside the grading transaction so an AI failure never rolls
			// back the student's graded attempt.
			let nextQuizId: string | null = null;
			if (graded.topicId && !mastered) {
				try {
					const topic = await loadTopicForGeneration(
						prisma,
						graded.topicId,
						ctx.organization.id,
					);
					nextQuizId = await generateQuizForTopic({
						tx: prisma,
						organizationId: ctx.organization.id,
						createdById: null,
						topic,
						numQuestions: 5,
						difficulty: graded.difficulty,
					});
				} catch (error) {
					logger.error(
						{
							error,
							topicId: graded.topicId,
							organizationId: ctx.organization.id,
						},
						"Failed to generate next adaptive quiz",
					);
				}
			}

			// Per-attempt feedback, derived from the answers we just graded rather
			// than from a second AI call — it costs nothing, cannot fail, and is
			// literally what the student did.
			const topicTitle = attempt.quiz.topic?.title ?? "this topic";
			const missed = reviewResults.filter((r) => !r.isCorrect);
			const nailed = reviewResults.filter((r) => r.isCorrect);

			const masteryPct = Math.round(graded.newMastery * 100);
			const confidence =
				masteryPct >= 80 ? "High" : masteryPct >= 50 ? "Building" : "Low";

			let recommendation: string;
			if (mastered) {
				recommendation = `You've mastered ${topicTitle}. Move on to the next topic.`;
			} else if (missed.length === 0) {
				recommendation = `Perfect score — your next quiz steps up to ${graded.difficulty}.`;
			} else if (graded.percentage < 50) {
				recommendation = `Review ${topicTitle} before continuing — you missed ${missed.length} of ${reviewResults.length} questions.`;
			} else {
				recommendation = `Close. Revisit the ${missed.length} question${missed.length === 1 ? "" : "s"} you missed, then try the next ${graded.difficulty} quiz.`;
			}

			return {
				attempt: graded.updatedAttempt,
				score: graded.score,
				percentage: graded.percentage,
				passed: graded.passed,
				mastery: graded.newMastery,
				difficulty: graded.difficulty,
				difficultyChanged: graded.difficultyChanged,
				nextQuizId,
				results: reviewResults,
				mastered,
				report: {
					topicTitle,
					confidence,
					recommendation,
					strengths: nailed.map((r) => r.prompt).slice(0, 4),
					weaknesses: missed.map((r) => r.prompt).slice(0, 4),
				},
			};
		}),
});
