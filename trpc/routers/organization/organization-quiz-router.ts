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
import {
	type Difficulty,
	nextDifficulty,
	TUTOR_SYSTEM_PROMPT,
	tutorModel,
	updateMastery,
} from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
	attemptIdSchema,
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
				type: z.enum(["multipleChoice", "trueFalse", "shortAnswer"]),
				// MCQ: 3-4 options; trueFalse: ["True","False"]; shortAnswer: [].
				options: z.array(z.string()).max(6).default([]),
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

	const prompt = `Create a ${difficulty} difficulty quiz with exactly ${numQuestions} questions for the topic "${topic.title}".

Use ONLY the study material below as the source of truth. Mix the question types:
- Most should be "multipleChoice" with 3-4 options.
- Include 1-2 "trueFalse" questions whose options are exactly ["True","False"].
- Include 1 "shortAnswer" question with an empty options array and a short (1-3 word) correctAnswer.
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
						q.type === "shortAnswer" || q.options.length === 0
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
							isCorrect: true,
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
					yourAnswer: a?.selectedOption ?? a?.responseText ?? null,
					correctAnswer: q.correctAnswer,
					explanation: q.explanation,
					isCorrect: a?.isCorrect ?? false,
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
							passingScore: true,
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
			}[] = [];

			// Grade in a transaction: write Answer[], update attempt, log mastery.
			const graded = await prisma.$transaction(async (tx) => {
				let score = 0;

				for (const question of questions) {
					const submitted = answerByQuestion.get(question.id);
					const selectedOption = submitted?.selectedOption ?? null;
					const responseText = submitted?.responseText ?? null;

					// Determine correctness. shortAnswer is matched case-insensitively
					// after trimming; everything else compares the chosen value.
					const candidate =
						question.type === QuestionType.shortAnswer
							? responseText
							: (selectedOption ?? responseText);

					const isCorrect =
						candidate != null &&
						candidate.trim().toLowerCase() ===
							question.correctAnswer.trim().toLowerCase();

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
						yourAnswer: candidate,
						correctAnswer: question.correctAnswer,
						explanation: question.explanation,
						isCorrect,
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
							isCorrect,
							pointsAwarded,
						},
						update: {
							selectedOption,
							responseText,
							isCorrect,
							pointsAwarded,
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

			// Generate the NEXT adaptive quiz at the new difficulty (best-effort).
			// Done outside the grading transaction so an AI failure never rolls
			// back the student's graded attempt.
			let nextQuizId: string | null = null;
			if (graded.topicId) {
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
			};
		}),
});
