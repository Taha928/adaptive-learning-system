import {
	AttemptStatus,
	PerformanceEventType,
	type Prisma,
	type PrismaClient,
	QuestionType,
	type QuizDifficulty,
	QuizPurpose,
	QuizStatus,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod/v4";
import {
	abilityFromHistory,
	buildMasteryReport,
	type PoolQuestion,
	recordTopicResult,
	STARTING_ABILITY,
	selectNextQuestion,
	type TopicStat,
} from "@/lib/ai/adaptive";
import { gradeFreeResponse } from "@/lib/ai/quiz-grading";
import { retrieveContext } from "@/lib/ai/retrieval";
import {
	type AnswerRecord,
	perStageFor,
	REVISION_STAGES,
	revisionProgress,
	stageTransition,
} from "@/lib/ai/revision";
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
	answerAdaptiveSchema,
	attemptIdSchema,
	generateAdaptiveSchema,
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

/**
 * Difficulty as a cognitive step, not as harder wording — Bloom's taxonomy.
 * Shared by every generation path so "medium" means the same thing whether it
 * came from a fixed quiz, an adaptive pool or a written Q&A set.
 *
 * The hard tier deliberately spans Analyse through Evaluate/Create rather than
 * introducing a fourth database level: the enum is three-valued and is also the
 * type nextDifficulty() returns, so widening it would ripple through mastery
 * and reporting for little gain.
 */
const BLOOM_LADDER: Record<Difficulty, string> = {
	easy: `Bloom level: REMEMBER. Recall a definition, term, or fact stated in the material. Answerable directly from the source. Example shape: "What is encryption?"`,
	medium: `Bloom level: UNDERSTAND / APPLY. Require the student to explain a mechanism in their own words, justify why something holds, or apply an idea to a straightforward case. Not answerable by copying one line. Example shape: "Explain why encryption improves confidentiality."`,
	hard: `Bloom level: ANALYSE / EVALUATE / CREATE. Pose a realistic scenario and require the student to diagnose it, compare options and justify a choice, or design an approach. Roughly half of these should be design or evaluation questions ("Which mechanism should be implemented and why?", "Design a secure authentication strategy for an online banking system"), not just analysis.`,
};

/** Passages behind a single-topic quiz. */
const QUIZ_TOP_K = 6;

/**
 * Passages per topic when building an adaptive pool. Deliberately small: this
 * one is multiplied by the topic count, so a course-wide pool over eight topics
 * at the single-topic budget would rebuild the wall of text retrieval replaced.
 *
 * The char budget must stay comfortably above one chunk (~3-5k chars). Set
 * below that, every topic would come back with a single truncated passage —
 * technically grounded, practically useless for writing eight questions.
 */
const POOL_TOP_K_PER_TOPIC = 3;
const POOL_CONTEXT_CHARS_PER_TOPIC = 6_000;

type TopicForGeneration = {
	id: string;
	courseId: string;
	title: string;
	summary: string | null;
	content: string | null;
	materialId: string | null;
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

	// Retrieve the passages about this topic instead of pasting the whole
	// material in and truncating. Only the source text changes here — difficulty
	// still comes from the caller and the Bloom ladder below is untouched.
	const { context } = await retrieveContext({
		organizationId,
		courseId: topic.courseId,
		materialIds: topic.materialId ? [topic.materialId] : null,
		query: [topic.title, topic.summary].filter(Boolean).join(". "),
		topK: QUIZ_TOP_K,
	});

	const sourceParts = [topic.summary, topic.content, context].filter(
		(part): part is string => Boolean(part?.trim()),
	);

	const sourceText = sourceParts.join("\n\n");

	// Longer quizzes get richer free-response questions; quick ones stay snappy.
	const includeLong = numQuestions >= 10;

	const prompt = `Create a quiz with exactly ${numQuestions} questions for the topic "${topic.title}".

EVERY question must sit at this one cognitive level:
${BLOOM_LADDER[difficulty]}

Never mention the difficulty level in a question's prompt — the student chose it and does not need reminding.

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
					// Every question in a fixed quiz is at the quiz's level and from
					// its topic. Recorded per question anyway so grading and the
					// mastery report read one shape regardless of how a quiz was made.
					difficulty: dbDifficulty,
					topicId: topic.id,
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
 * Schema for ONE difficulty tier of an adaptive pool.
 *
 * There is no `difficulty` field: the tier is fixed by the call that produced
 * it. Asking one call for a whole mixed pool loses twice — the model plateaus
 * well under a large count (strict structured output ignores minItems, so the
 * schema cannot hold it to the number), and it distributes the tiers however it
 * likes, which produced pools with only 3 easy questions for 6 topics. Three
 * smaller, tier-locked calls run in parallel and make the balance a fact rather
 * than a request.
 */
/**
 * What kind of questions a pool contains.
 *   mixed   — assessments: mostly multiple choice, fast to answer, easy to mark.
 *   written — revision: every answer typed, so the student has to produce the
 *             idea rather than recognise it, and the AI marks against a rubric.
 */
type PoolStyle = "mixed" | "written";

/**
 * The tier schema, narrowed per style.
 *
 * Built per style rather than shared-and-widened on purpose: a revision set must
 * NEVER contain a multiple-choice question, and the only way to guarantee that
 * is for the enum to make it unrepresentable. Stating the rule in the prompt and
 * repairing the output afterwards would make it a request the model can ignore.
 * The shape is otherwise identical, so this varies the constraint, not the logic.
 */
function tierSchemaFor(style: PoolStyle) {
	return z.object({
		questions: z
			.array(
				z.object({
					topicTitle: z
						.string()
						.describe("Exact title of the topic this question comes from"),
					prompt: z
						.string()
						.describe(
							"The question itself. Must NOT mention its difficulty or topic — both are metadata, never shown to the student",
						),
					type:
						style === "written"
							? z.enum(["shortAnswer", "longAnswer"])
							: z.enum(["multipleChoice", "trueFalse", "shortAnswer"]),
					options: z.array(z.string()).max(6),
					correctAnswer: z.string(),
					explanation: z.string(),
				}),
			)
			.min(1),
	});
}

type TierQuestion = z.infer<
	ReturnType<typeof tierSchemaFor>
>["questions"][number];

const STYLE_RULES: Record<PoolStyle, string> = {
	mixed: `Question types:
- Mostly "multipleChoice" with 3-4 plausible options.
- Some "trueFalse" whose options are exactly ["True","False"].
- A few "shortAnswer" with an empty options array and a short (1-3 word) correctAnswer.
For multipleChoice and trueFalse the "correctAnswer" MUST exactly match one of the options.`,
	written: `Every answer is TYPED by the student — there is nothing to choose from.
- "options" MUST be an empty array for every question.
- "correctAnswer" is a model answer / marking rubric describing what a correct response must contain.
- Use "longAnswer" where the idea needs a paragraph, "shortAnswer" where a sentence or a term will do.
- Ask the student to explain, justify or describe in their own words. Never phrase a question as "which of the following".`,
};

/** Normalised title -> id, so the model's `topicTitle` can be resolved to a row. */
function buildTopicIndex(
	topics: { id: string; title: string }[],
): Map<string, string> {
	return new Map(topics.map((t) => [t.title.trim().toLowerCase(), t.id]));
}

/**
 * How many questions to generate for a target assessment length.
 *
 * The pool must exceed the length, or the engine has nothing to choose between
 * and "adaptive" degenerates into "shuffled". It must also scale with the
 * number of TOPICS: a 13-question pool spread over 6 topics leaves ~4 questions
 * per difficulty tier, so a struggling student exhausts the easy ones and the
 * engine is forced to serve them something hard — the exact opposite of the
 * intent. Three per topic keeps roughly one per tier per topic available.
 */
/** Below this the pool cannot support adaptation at all, so generation fails loudly. */
const MIN_ADAPTIVE_POOL = 8;
/** Shortest assessment worth calling adaptive — the ability search needs room. */
const MIN_ADAPTIVE_LENGTH = 5;

/**
 * How many questions to ask for in EACH difficulty tier.
 *
 * Sized against the assessment length, not against the pool: a student who gets
 * everything wrong stays in the easy tier for the whole assessment, so the easy
 * tier alone must be able to cover it. Sizing tiers at poolSize/3 produced four
 * easy questions for an eight-question assessment, which ran dry at Q4 and
 * forced the engine to serve a struggling student progressively harder items —
 * precisely backwards.
 *
 * Capped at 10: past that the model's output degrades and it silently returns
 * fewer anyway.
 */
function tierSizeFor(numQuestions: number, topicCount: number): number {
	return Math.min(10, Math.max(4, numQuestions, Math.ceil(topicCount * 1.2)));
}

/**
 * The assessment length the pool can honestly sustain.
 *
 * Bounded by the SMALLEST tier, because that is the tier a student who sits at
 * one end of the ability range will live in. Allowing 1.5x means a weak student
 * spends most of the assessment on easy questions and only drifts up at the
 * tail, rather than being marched to hard mid-way.
 */
function lengthFor(numQuestions: number, smallestTier: number): number {
	return Math.max(
		MIN_ADAPTIVE_LENGTH,
		Math.min(numQuestions, Math.floor(smallestTier * 1.5)),
	);
}

/** Generate the questions for ONE difficulty tier, across every topic. */
async function generateTier(params: {
	tier: Difficulty;
	count: number;
	courseTitle: string;
	topicBlocks: string;
	topicCount: number;
	style: PoolStyle;
}): Promise<{ tier: Difficulty; questions: TierQuestion[] }> {
	const { tier, count, courseTitle, topicBlocks, topicCount, style } = params;

	const prompt = `Write EXACTLY ${count} questions about the course "${courseTitle}", ALL at one single cognitive level.

${BLOOM_LADDER[tier]}

Every question must sit at that level. Do not vary it — a different call handles the other levels.

Spread the ${count} questions across the ${topicCount} topic(s) below as evenly as the material allows. Set "topicTitle" to the EXACT topic title from the list, copied character for character.

CRITICAL: the student never sees the level. Never write "[Easy]", "Easy:", "Basic:", "Advanced:" or any level or topic marker inside a prompt. The prompt is only the question.

${STYLE_RULES[style]}
Give every question a short explanation — for revision this is where the student actually learns, so make it teach rather than just assert.

Topics:
${topicBlocks}`;

	const { object } = await generateObject({
		model: tutorModel(),
		system: TUTOR_SYSTEM_PROMPT,
		schema: tierSchemaFor(style),
		prompt,
	});

	// The enum already rules out choice-based types for written pools; this drops
	// any stray options the model attaches anyway, so nothing leaks an answer.
	const questions =
		style === "written"
			? object.questions.map((q) => ({ ...q, options: [] }))
			: object.questions;

	return { tier, questions };
}

/**
 * Generate an adaptive pool: one LLM call PER DIFFICULTY TIER, run in parallel,
 * producing questions spanning difficulty x topic. Stored as a normal Quiz whose
 * questions carry their own level and topic. Nothing is served yet —
 * `startAttempt` and `answerAdaptive` select from this pool as the student plays.
 *
 * Shared by assessments and revision sets. They differ in `style` (what the
 * questions look like), `purpose` (how they are presented) and which `tiers`
 * exist — never in how selection, grading or mastery work. Pinning a revision
 * set to one difficulty simply builds a single-tier pool: the same engine still
 * runs, it just has no level to choose between and adapts topic alone.
 */
async function generateAdaptivePool(params: {
	organizationId: string;
	createdById: string;
	courseId: string;
	courseTitle: string;
	topics: { id: string; title: string; summary: string | null }[];
	numQuestions: number;
	style: PoolStyle;
	purpose: QuizPurpose;
	/** Which levels the pool spans. One entry pins the set to that level. */
	tiers: readonly Difficulty[];
	title: string;
	description: string;
}): Promise<{ quizId: string; poolSize: number; length: number }> {
	const {
		organizationId,
		createdById,
		courseId,
		courseTitle,
		topics,
		numQuestions,
		style,
		purpose,
		tiers: wantedTiers,
		title,
		description,
	} = params;

	// A single-tier pool has no other level to fall back on, so it must carry the
	// whole session itself rather than a third of it.
	//
	// Revision needs a deeper tier than an assessment even when it spans all
	// three: a wrong answer is followed by ANOTHER question on the same topic at
	// the same level, and a tier holding roughly one question per topic has none
	// to offer. Two per topic makes the retry real rather than aspirational.
	const perLevel =
		wantedTiers.length === 1
			? Math.min(12, Math.max(numQuestions + 3, 6))
			: purpose === QuizPurpose.revision
				? Math.min(12, Math.max(numQuestions, topics.length * 2))
				: tierSizeFor(numQuestions, topics.length);

	// Ground each topic in its own retrieved passages. Before this, the pool was
	// built from topic titles and summaries alone — a sentence or two — so the
	// model invented plausible-sounding questions rather than asking about what
	// the course actually taught. Retrieval is per topic (not one query for the
	// whole course) so a topic's questions come from that topic's material.
	//
	// Only the source text the model reads changes. Tier sizing, the Bloom
	// ladder, question selection and mastery all sit outside this and are
	// untouched.
	const topicContexts = await Promise.all(
		topics.map(async (t) => {
			try {
				const { context } = await retrieveContext({
					organizationId,
					courseId,
					query: [t.title, t.summary].filter(Boolean).join(". "),
					topK: POOL_TOP_K_PER_TOPIC,
					maxChars: POOL_CONTEXT_CHARS_PER_TOPIC,
				});
				return context;
			} catch (error) {
				// One topic's retrieval failing must not sink the whole quiz; it
				// falls back to title + summary, which is what it had before.
				logger.warn(
					{ error, topicId: t.id, organizationId },
					"Retrieval failed for topic; generating from its summary alone",
				);
				return "";
			}
		}),
	);

	const topicBlocks = topics
		.map((t, i) => {
			const summary = t.summary ? `\n   ${t.summary.slice(0, 400)}` : "";
			const context = topicContexts[i]
				? `\n   Source material for this topic:\n${topicContexts[i]
						?.split("\n")
						.map((line) => `   ${line}`)
						.join("\n")}`
				: "";
			return `${i + 1}. ${t.title}${summary}${context}`;
		})
		.join("\n\n");

	// One call per tier, concurrently: small asks the model can actually satisfy,
	// and a tier balance guaranteed by construction instead of requested in a
	// prompt and silently ignored.
	const tiers = await Promise.all(
		wantedTiers.map((tier) =>
			generateTier({
				tier,
				count: perLevel,
				courseTitle,
				topicBlocks,
				topicCount: topics.length,
				style,
			}),
		),
	);

	const topicIndex = buildTopicIndex(topics);
	// A pool question whose topic cannot be resolved is dropped rather than
	// silently attributed to the wrong topic — the mastery report is only worth
	// anything if the attribution is real.
	const usable = tiers.flatMap(({ tier, questions }) =>
		questions
			.filter((q) => topicIndex.has(q.topicTitle.trim().toLowerCase()))
			.map((q) => ({ ...q, difficulty: tier })),
	);

	const generated = tiers.reduce((n, t) => n + t.questions.length, 0);
	if (usable.length < MIN_ADAPTIVE_POOL) {
		throw new Error(
			`Adaptive pool too small: ${usable.length} usable of ${generated} generated`,
		);
	}

	// Never serve a tier dry. Once the questions near a student's ability run out
	// the engine has to serve whatever is left, which is how a struggling student
	// ends up staring at a "design a strategy" question. The caller reports this
	// number, so a trimmed set is visible rather than silent.
	const tierCounts = wantedTiers.map(
		(tier) => usable.filter((q) => q.difficulty === tier).length,
	);
	const length =
		wantedTiers.length === 1
			? Math.max(MIN_ADAPTIVE_LENGTH, Math.min(numQuestions, usable.length))
			: lengthFor(numQuestions, Math.min(...tierCounts));

	const quiz = await prisma.quiz.create({
		data: {
			organizationId,
			courseId,
			// A course-wide pool has no single topic; a topic-scoped one does. This
			// also keeps the pool out of the per-topic adaptive ladder in
			// submitAttempt, which is a different mechanism.
			topicId: null,
			createdById,
			// Titled here rather than by the model: the pool comes from several
			// separate calls, so none of them owns the set's name.
			title,
			description,
			// Nominal only. The real level varies per question; this is what the
			// listing screens show. A pinned set has one real level, so say so.
			difficulty: (wantedTiers.length === 1
				? wantedTiers[0]
				: "medium") as QuizDifficulty,
			purpose,
			isAdaptive: true,
			adaptiveLength: length,
			isAiGenerated: true,
			status: QuizStatus.published,
			questions: {
				create: usable.map((q, index) => ({
					organizationId,
					difficulty: q.difficulty as QuizDifficulty,
					topicId: topicIndex.get(q.topicTitle.trim().toLowerCase())!,
					prompt: q.prompt,
					type: AI_TYPE_TO_DB[q.type] ?? QuestionType.multipleChoice,
					options:
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

	return { quizId: quiz.id, poolSize: usable.length, length };
}

/**
 * Load a course and the topics a pool should span, org-scoped. `topicId` narrows
 * it to one topic; null spans the whole course.
 */
async function loadCourseAndTopics(
	organizationId: string,
	courseId: string,
	topicId: string | null,
) {
	const course = await prisma.course.findFirst({
		where: { id: courseId, organizationId },
		select: { id: true, title: true },
	});

	if (!course) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
	}

	const topics = await prisma.topic.findMany({
		where: {
			courseId: course.id,
			organizationId,
			...(topicId ? { id: topicId } : {}),
		},
		orderBy: { orderIndex: "asc" },
		select: { id: true, title: true, summary: true },
	});

	if (topics.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: topicId
				? "Topic not found in this course."
				: "This course has no topics yet. Generate topics from a material first.",
		});
	}

	return { course, topics };
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
			// The material's text is no longer loaded: generation retrieves the
			// passages it needs instead of carrying the whole document around.
			materialId: true,
		},
	});

	if (!topic) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });
	}

	return topic;
}

/** The pool as loaded for an in-flight adaptive attempt. */
type AdaptiveQuestion = {
	id: string;
	difficulty: QuizDifficulty | null;
	topicId: string | null;
	orderIndex: number;
	type: QuestionType;
	prompt: string;
	options: Prisma.JsonValue;
	points: number;
	correctAnswer: string;
	explanation: string | null;
	topic: { id: string; title: string } | null;
};

/** Fields a student may see while the assessment is running — no answer, no level. */
function toClientQuestion(q: AdaptiveQuestion) {
	return {
		id: q.id,
		prompt: q.prompt,
		type: q.type,
		options: q.options,
		points: q.points,
		orderIndex: q.orderIndex,
		// The topic IS shown — it orients the student without revealing the level.
		topicTitle: q.topic?.title ?? null,
	};
}

function toPool(questions: AdaptiveQuestion[]): PoolQuestion[] {
	return questions.map((q) => ({
		id: q.id,
		// Legacy rows predate the column; treat them as mid-level rather than
		// dropping them from the pool.
		difficulty: (q.difficulty ?? "medium") as Difficulty,
		topicId: q.topicId,
		orderIndex: q.orderIndex,
	}));
}

/** Latest recorded mastery per topic, so the engine can skip what is already known. */
async function loadPriorMastery(
	organizationId: string,
	userId: string,
	topicIds: string[],
): Promise<Map<string, number>> {
	if (topicIds.length === 0) return new Map();

	const logs = await prisma.performanceLog.findMany({
		where: {
			organizationId,
			userId,
			topicId: { in: topicIds },
			masteryScore: { not: null },
		},
		orderBy: { occurredAt: "desc" },
		select: { topicId: true, masteryScore: true },
	});

	const mastery = new Map<string, number>();
	for (const log of logs) {
		if (log.topicId && log.masteryScore != null && !mastery.has(log.topicId)) {
			mastery.set(log.topicId, log.masteryScore);
		}
	}
	return mastery;
}

/**
 * Rebuild the engine's state by replaying the answers already recorded for this
 * attempt. Nothing about the adaptive run is stored beyond the Answer rows, so
 * state cannot drift out of sync with the grades and a resumed attempt behaves
 * identically to an uninterrupted one.
 */
function rebuildAdaptiveState(
	questions: AdaptiveQuestion[],
	answers: { questionId: string; isCorrect: boolean | null }[],
): {
	ability: number;
	topicStats: Map<string, TopicStat>;
	askedIds: Set<string>;
	history: AnswerRecord[];
} {
	const byId = new Map(questions.map((q) => [q.id, q]));
	const askedIds = new Set(answers.map((a) => a.questionId));

	let topicStats = new Map<string, TopicStat>();
	const history: AnswerRecord[] = [];

	for (const answer of answers) {
		const question = byId.get(answer.questionId);
		if (!question) continue;
		const isCorrect = answer.isCorrect ?? false;
		history.push({
			level: (question.difficulty ?? "medium") as Difficulty,
			isCorrect,
		});
		topicStats = recordTopicResult(topicStats, question.topicId, isCorrect);
	}

	return {
		ability:
			history.length === 0 ? STARTING_ABILITY : abilityFromHistory(history),
		topicStats,
		askedIds,
		history,
	};
}

/** Grade a single answer. MCQ/true-false by exact match, free response by AI. */
type OneAnswerGrade = {
	isCorrect: boolean;
	aiFeedback: string | null;
	/** Remediation for a wrong answer; null when correct or unavailable. */
	keyConcept: string | null;
	revisionTip: string | null;
};

async function gradeOneAnswer(params: {
	question: AdaptiveQuestion;
	selectedOption: string | null;
	responseText: string | null;
	responseImage: string | null;
}): Promise<OneAnswerGrade> {
	const { question, selectedOption, responseText, responseImage } = params;

	const isFreeResponse =
		question.type === QuestionType.shortAnswer ||
		question.type === QuestionType.longAnswer;

	if (!isFreeResponse) {
		return {
			isCorrect:
				selectedOption != null &&
				selectedOption.trim().toLowerCase() ===
					question.correctAnswer.trim().toLowerCase(),
			aiFeedback: null,
			keyConcept: null,
			revisionTip: null,
		};
	}

	try {
		const grade = await gradeFreeResponse({
			prompt: question.prompt,
			correctAnswer: question.correctAnswer,
			responseText,
			responseImage,
			isLong: question.type === QuestionType.longAnswer,
		});
		return {
			isCorrect: grade.isCorrect,
			aiFeedback: grade.feedback,
			// Belt and braces: the prompt says null when correct, but a stray tip on
			// a right answer would read as "you got it wrong".
			keyConcept: grade.isCorrect ? null : grade.keyConcept,
			revisionTip: grade.isCorrect ? null : grade.revisionTip,
		};
	} catch (error) {
		logger.error(
			{ error, questionId: question.id },
			"AI grading failed on adaptive answer; falling back to string match",
		);
		if (responseText != null) {
			return {
				isCorrect:
					responseText.trim().toLowerCase() ===
					question.correctAnswer.trim().toLowerCase(),
				aiFeedback: null,
				keyConcept: null,
				revisionTip: null,
			};
		}
		// An image-only answer cannot be string-matched. Don't penalise the
		// student for our outage.
		return {
			isCorrect: Boolean(responseImage),
			aiFeedback: responseImage
				? "Automatic grading was temporarily unavailable, so this answer was marked as complete — compare it with the model answer to check yourself."
				: null,
			keyConcept: null,
			revisionTip: null,
		};
	}
}

/**
 * Close out an adaptive attempt: score it, record per-topic mastery, and build
 * the areas-based report.
 *
 * The per-topic mastery write is what a fixed quiz cannot do. A fixed quiz has
 * one topic, so submitAttempt logs one mastery score; an adaptive assessment
 * spans several, and because every Question now carries its own topicId each
 * one can be updated independently — which is what makes the Progress Report's
 * topic bars move after an assessment.
 */
async function finalizeAdaptiveAttempt(params: {
	organizationId: string;
	userId: string;
	attemptId: string;
	startedAt: Date;
	courseId: string;
	passingScore: number;
	questions: AdaptiveQuestion[];
}) {
	const {
		organizationId,
		userId,
		attemptId,
		startedAt,
		courseId,
		passingScore,
		questions,
	} = params;

	const byId = new Map(questions.map((q) => [q.id, q]));

	const answers = await prisma.answer.findMany({
		where: { attemptId },
		orderBy: { createdAt: "asc" },
		select: {
			questionId: true,
			isCorrect: true,
			selectedOption: true,
			responseText: true,
			responseImage: true,
			pointsAwarded: true,
			aiFeedback: true,
		},
	});

	const score = answers.reduce((sum, a) => sum + (a.pointsAwarded ?? 0), 0);
	const maxScore = answers.length || 1;
	const percentage = Number(((score / maxScore) * 100).toFixed(2));
	const passed = percentage >= passingScore;
	const submittedAt = new Date();
	const durationSeconds = Math.max(
		0,
		Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000),
	);

	// Per-topic outcomes drive both the report and the mastery writes.
	const outcomes = answers.map((a) => {
		const q = byId.get(a.questionId);
		return {
			topicId: q?.topicId ?? null,
			topicTitle: q?.topic?.title ?? "Unknown topic",
			isCorrect: a.isCorrect ?? false,
		};
	});

	const report = buildMasteryReport(outcomes);

	const perTopic = new Map<string, { correct: number; total: number }>();
	for (const o of outcomes) {
		if (!o.topicId) continue;
		const e = perTopic.get(o.topicId) ?? { correct: 0, total: 0 };
		e.correct += o.isCorrect ? 1 : 0;
		e.total += 1;
		perTopic.set(o.topicId, e);
	}

	const priorMastery = await loadPriorMastery(organizationId, userId, [
		...perTopic.keys(),
	]);

	const updatedAttempt = await prisma.$transaction(async (tx) => {
		const updated = await tx.quizAttempt.update({
			where: { id: attemptId },
			data: {
				score,
				// The student answered exactly this many, which is the honest
				// denominator even if they somehow saw fewer than planned.
				maxScore,
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

		// One EMA mastery update per topic the assessment actually touched.
		for (const [topicId, stat] of perTopic) {
			const newMastery = updateMastery(
				priorMastery.get(topicId) ?? null,
				stat.correct / stat.total,
			);
			await tx.performanceLog.create({
				data: {
					organizationId,
					userId,
					courseId,
					topicId,
					quizAttemptId: attemptId,
					eventType: PerformanceEventType.quizCompleted,
					masteryScore: newMastery,
					durationSeconds,
				},
			});
		}

		return updated;
	});

	await recordStreakActivity(userId);

	const results = answers.map((a) => {
		const q = byId.get(a.questionId);
		return {
			questionId: a.questionId,
			prompt: q?.prompt ?? "",
			options: Array.isArray(q?.options)
				? (q.options as unknown[]).filter(
						(o): o is string => typeof o === "string",
					)
				: [],
			yourAnswer:
				a.selectedOption ??
				a.responseText ??
				(a.responseImage ? "[Image answer]" : null),
			correctAnswer: q?.correctAnswer ?? "",
			explanation: q?.explanation ?? null,
			isCorrect: a.isCorrect ?? false,
			aiFeedback: a.aiFeedback,
		};
	});

	return {
		attempt: updatedAttempt,
		score,
		maxScore,
		percentage,
		passed,
		report,
		results,
	};
}

export const organizationQuizRouter = createTRPCRouter({
	// List quizzes, optionally for one course, with question/attempt counts.
	list: protectedOrganizationProcedure
		.input(listQuizzesSchema)
		.query(async ({ ctx, input }) => {
			const where: Prisma.QuizWhereInput = {
				organizationId: ctx.organization.id,
				// Assessments and revision sets live on different screens. Telling
				// them apart by shape used to be guesswork — a course-wide adaptive
				// assessment is also topicId: null, so it surfaced in the Q&A list.
				purpose: input.purpose,
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
					isAdaptive: true,
					adaptiveLength: true,
					purpose: true,
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
							topic: { select: { title: true } },
						},
					},
				},
			});

			if (!quiz) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			// An adaptive assessment must not ship its pool to the client: seeing
			// it would reveal both the questions ahead and, by their spread, the
			// engine's next move. The adaptive runner receives one question at a
			// time from startAttempt/answerAdaptive instead.
			if (quiz.isAdaptive) {
				return {
					...quiz,
					questions: [],
					totalQuestions: Math.min(
						quiz.adaptiveLength ?? quiz.questions.length,
						quiz.questions.length,
					),
				};
			}

			return { ...quiz, totalQuestions: quiz.questions.length };
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
			const quiz = await prisma.quiz.findFirst({
				where: { id: input.quizId, organizationId: ctx.organization.id },
				select: { id: true, createdById: true, purpose: true },
			});

			if (!quiz) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found" });
			}

			// A student generates their own revision sessions, so they must be able
			// to remove them — but only their own. Instructors keep authority over
			// course content. Deliberately NOT "revision sets are unprotected":
			// ownership is the check, purpose only decides who else may pass.
			const isOwner = quiz.createdById === ctx.user.id;
			const canManage =
				ctx.membership.role === "owner" || ctx.membership.role === "admin";

			if (!isOwner && !canManage) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						quiz.purpose === QuizPurpose.revision
							? "You can only delete revision sessions you created"
							: "Only instructors can delete quizzes",
				});
			}

			// Question, QuizAttempt and Answer all cascade from Quiz, so this also
			// removes other students' attempts at an instructor's quiz — which is
			// why a non-owner must be an instructor to get here.
			await prisma.quiz.delete({ where: { id: quiz.id } });

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
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Attempt not found",
				});
			}

			return { success: true };
		}),

	// Build a written revision set covering every topic in a course.
	//
	// The SAME adaptive engine as an assessment — same pool generation, same
	// selection, same grading, same per-topic mastery. Only three things differ:
	// the questions are written rather than multiple choice, the purpose is
	// `revision` (so marks are shown after each answer instead of withheld), and
	// pinning a difficulty builds a single-tier pool rather than three.
	//
	// Deliberately NOT instructor-gated: this is a student revising, not
	// authoring content.
	generateCourseQA: protectedOrganizationProcedure
		.input(generateCourseQASchema)
		.mutation(async ({ ctx, input }) => {
			const { course, topics } = await loadCourseAndTopics(
				ctx.organization.id,
				input.courseId,
				input.topicId,
			);

			// Pinning a level narrows the pool to one tier. The engine is unchanged:
			// it simply has no difficulty to choose between, and adapts topic alone.
			const adaptive = input.difficulty === "adaptive";
			const tiers: readonly Difficulty[] =
				input.difficulty === "adaptive"
					? ["easy", "medium", "hard"]
					: [input.difficulty];

			const scope =
				topics.length === 1 ? topics[0]!.title : `all ${topics.length} topics`;

			try {
				const { quizId, poolSize, length } = await generateAdaptivePool({
					organizationId: ctx.organization.id,
					createdById: ctx.user.id,
					courseId: course.id,
					courseTitle: course.title,
					topics,
					numQuestions: input.numQuestions,
					style: "written",
					purpose: QuizPurpose.revision,
					tiers,
					title: `${topics.length === 1 ? topics[0]!.title : course.title} — revision`,
					description: adaptive
						? `Written revision across ${scope} in ${course.title}. Questions adapt to your answers.`
						: `Written ${input.difficulty} revision across ${scope} in ${course.title}.`,
				});

				return {
					quizId,
					topicCount: topics.length,
					// The count actually served, not the count requested.
					numQuestions: length,
					requestedQuestions: input.numQuestions,
					poolSize,
				};
			} catch (error) {
				logger.error(
					{ error, courseId: course.id, organizationId: ctx.organization.id },
					"Failed to generate revision set",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not build the revision set. Please try again.",
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

	// Build an adaptive assessment. Like generateCourseQA and unlike
	// generateFromTopic, this is NOT instructor-gated: a student sitting an
	// assessment is practising, not authoring content.
	generateAdaptive: protectedOrganizationProcedure
		.input(generateAdaptiveSchema)
		.mutation(async ({ ctx, input }) => {
			const { course, topics } = await loadCourseAndTopics(
				ctx.organization.id,
				input.courseId,
				input.topicId,
			);

			try {
				const { quizId, poolSize, length } = await generateAdaptivePool({
					organizationId: ctx.organization.id,
					createdById: ctx.user.id,
					courseId: course.id,
					courseTitle: course.title,
					topics,
					numQuestions: input.numQuestions,
					style: "mixed",
					purpose: QuizPurpose.assessment,
					tiers: ["easy", "medium", "hard"],
					title:
						topics.length === 1
							? `${topics[0]!.title} — adaptive assessment`
							: `${course.title} — adaptive assessment`,
					description: `Adaptive assessment across ${topics.length} topic${topics.length === 1 ? "" : "s"} in ${course.title}.`,
				});

				return {
					quizId,
					topicCount: topics.length,
					// The length actually served, which may be below the request when
					// the model returns a thin pool. Reported, never silently swapped.
					numQuestions: length,
					requestedQuestions: input.numQuestions,
					poolSize,
				};
			} catch (error) {
				logger.error(
					{ error, courseId: course.id, organizationId: ctx.organization.id },
					"Failed to generate adaptive assessment",
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not build the assessment. Please try again.",
				});
			}
		}),

	// Answer ONE question of an adaptive assessment and receive the next one the
	// engine selects. Grading happens per answer so the selection can react to
	// it — this is the loop that a whole-quiz submit cannot express.
	answerAdaptive: protectedOrganizationProcedure
		.input(answerAdaptiveSchema)
		.mutation(async ({ ctx, input }) => {
			const attempt = await prisma.quizAttempt.findFirst({
				where: {
					id: input.attemptId,
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
				},
				select: {
					id: true,
					status: true,
					startedAt: true,
					maxScore: true,
					quiz: {
						select: {
							id: true,
							courseId: true,
							isAdaptive: true,
							adaptiveLength: true,
							purpose: true,
							passingScore: true,
							questions: {
								orderBy: { orderIndex: "asc" },
								select: {
									id: true,
									difficulty: true,
									topicId: true,
									orderIndex: true,
									type: true,
									prompt: true,
									options: true,
									points: true,
									correctAnswer: true,
									explanation: true,
									topic: { select: { id: true, title: true } },
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
			if (!attempt.quiz.isAdaptive) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This is not an adaptive assessment",
				});
			}
			if (attempt.status === AttemptStatus.graded) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This attempt has already been submitted",
				});
			}

			const questions = attempt.quiz.questions;
			const question = questions.find((q) => q.id === input.questionId);
			if (!question) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Question is not part of this assessment",
				});
			}

			// Answering the same question twice would corrupt the ability estimate,
			// so the Answer row is the idempotency key.
			const existing = await prisma.answer.findUnique({
				where: {
					attemptId_questionId: {
						attemptId: attempt.id,
						questionId: question.id,
					},
				},
				select: { id: true },
			});
			if (existing) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "That question has already been answered",
				});
			}

			const selectedOption = input.selectedOption ?? null;
			const responseText = input.responseText ?? null;
			const responseImage = input.responseImage ?? null;

			const { isCorrect, aiFeedback, keyConcept, revisionTip } =
				await gradeOneAnswer({
					question,
					selectedOption,
					responseText,
					responseImage,
				});

			await prisma.answer.create({
				data: {
					organizationId: ctx.organization.id,
					attemptId: attempt.id,
					questionId: question.id,
					userId: ctx.user.id,
					selectedOption,
					responseText,
					responseImage,
					isCorrect,
					pointsAwarded: isCorrect ? question.points : 0,
					aiFeedback,
				},
			});

			const answers = await prisma.answer.findMany({
				where: { attemptId: attempt.id },
				select: { questionId: true, isCorrect: true },
			});

			const answeredCount = answers.length;
			const target = attempt.quiz.adaptiveLength ?? attempt.maxScore;
			const isRevision = attempt.quiz.purpose === QuizPurpose.revision;

			// Re-derive ability from every answer so far, including this one.
			const { ability, topicStats, askedIds, history } = rebuildAdaptiveState(
				questions,
				answers,
			);

			const topicIds = [
				...new Set(
					questions.map((q) => q.topicId).filter((t): t is string => !!t),
				),
			];
			const priorMastery = await loadPriorMastery(
				ctx.organization.id,
				ctx.user.id,
				topicIds,
			);

			// --- Which questions are eligible right now ---
			//
			// Assessments consider the whole pool and let ability find the level.
			// Revision walks a ladder, so only the current stage is eligible — the
			// same narrowing that pinning a difficulty already does. Selection
			// itself is untouched: the engine still picks within whatever it is
			// handed, on ability and topic.
			const perStage = perStageFor(target);
			const progress = isRevision ? revisionProgress(history, perStage) : null;
			const transition = isRevision
				? stageTransition(history, perStage)
				: { justCompleted: null, nextStage: null };

			const pick = (pool: PoolQuestion[]) =>
				pool.length === 0
					? null
					: selectNextQuestion({
							pool,
							askedIds,
							ability,
							topicStats,
							priorMastery,
						});

			let next: PoolQuestion | null = null;

			if (!isRevision) {
				next = answeredCount >= target ? null : pick(toPool(questions));
			} else if (progress?.currentStage) {
				const full = toPool(questions);
				const from = REVISION_STAGES.indexOf(progress.currentStage);

				// Walk forward from the current stage. Normally this picks on the
				// first pass; the loop only matters when a stage's questions run out
				// before its pass criteria are met, in which case falling through to
				// the next stage is far better than ending the session early.
				for (let i = from; i < REVISION_STAGES.length && !next; i++) {
					const stage = REVISION_STAGES[i]!;
					const remaining = full.filter(
						(q) => q.difficulty === stage && !askedIds.has(q.id),
					);
					if (remaining.length === 0) continue;

					// Got it wrong? Practise the same topic again before progressing,
					// rather than leaving the point unresolved. The engine's struggle
					// term already leans this way; narrowing makes it certain, while
					// the stage still has that topic to offer.
					const sameTopic =
						i === from && !isCorrect && question.topicId
							? remaining.filter((q) => q.topicId === question.topicId)
							: [];

					next = pick(sameTopic.length > 0 ? sameTopic : remaining);
				}
			}

			// THE difference between the two modules, and it lives here rather than
			// in the client: revision marks the answer in front of the student
			// straight away, because that is the moment they learn. An assessment
			// withholds everything until the end — returning it and asking the UI
			// not to render it would leak it to anyone reading the network tab.
			const feedback = isRevision
				? {
						isCorrect,
						yourAnswer:
							selectedOption ??
							responseText ??
							(responseImage ? "[Image answer]" : null),
						correctAnswer: question.correctAnswer,
						explanation: question.explanation,
						aiFeedback,
						topicTitle: question.topic?.title ?? null,
						// Remediation, produced by the grading call itself and only
						// populated when the answer was wrong.
						keyConcept,
						revisionTip,
						// True when the next question is a second go at this topic,
						// so the UI can say so rather than looking like a repeat.
						retryOnSameTopic:
							!isCorrect &&
							next != null &&
							next.topicId === question.topicId &&
							transition.justCompleted == null,
					}
				: null;

			// Stage gate: "Easy Revision Completed -> Continue to Medium".
			const stage = isRevision
				? {
						current: progress?.currentStage ?? null,
						justCompleted: transition.justCompleted,
						next: transition.nextStage,
						answeredInStage: progress?.answeredInStage ?? 0,
						perStage,
						stages: progress?.stages ?? [],
					}
				: null;

			if (!next) {
				const finished = await finalizeAdaptiveAttempt({
					organizationId: ctx.organization.id,
					userId: ctx.user.id,
					attemptId: attempt.id,
					startedAt: attempt.startedAt,
					courseId: attempt.quiz.courseId,
					passingScore: attempt.quiz.passingScore,
					questions,
				});

				return {
					finished: true as const,
					answeredCount,
					totalQuestions: answeredCount,
					question: null,
					feedback,
					stage,
					result: finished,
				};
			}

			const nextQuestion = questions.find((q) => q.id === next.id);

			return {
				finished: false as const,
				answeredCount,
				// A revision session runs until every stage is cleared, so its length
				// is a target rather than a count — extra practice on a wrong answer
				// pushes past it by design. Never report a total below what has
				// already been answered.
				totalQuestions: isRevision
					? Math.max(target, answeredCount + 1)
					: target,
				question: nextQuestion ? toClientQuestion(nextQuestion) : null,
				feedback,
				stage,
				result: null,
			};
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
					isAdaptive: true,
					adaptiveLength: true,
					questions: {
						orderBy: { orderIndex: "asc" },
						select: {
							id: true,
							difficulty: true,
							topicId: true,
							prompt: true,
							type: true,
							options: true,
							points: true,
							orderIndex: true,
							correctAnswer: true,
							explanation: true,
							topic: { select: { id: true, title: true } },
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

			// An adaptive attempt is scored out of how many it will SERVE, not out
			// of the pool it draws from.
			const target = Math.min(
				quiz.adaptiveLength ?? quiz.questions.length,
				quiz.questions.length,
			);
			const maxScore = quiz.isAdaptive
				? target
				: quiz.questions.reduce((sum, q) => sum + q.points, 0);

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

			// Fixed quizzes hand over the whole paper, exactly as before.
			if (!quiz.isAdaptive) {
				return {
					attempt,
					questions: quiz.questions.map(toClientQuestion),
					isAdaptive: false as const,
					totalQuestions: quiz.questions.length,
				};
			}

			// Adaptive assessments hand over ONE question — the engine's opening
			// pick at STARTING_ABILITY, weighted toward topics the student has not
			// yet proven.
			const topicIds = [
				...new Set(
					quiz.questions.map((q) => q.topicId).filter((t): t is string => !!t),
				),
			];
			const priorMastery = await loadPriorMastery(
				ctx.organization.id,
				ctx.user.id,
				topicIds,
			);

			const first = selectNextQuestion({
				pool: toPool(quiz.questions),
				askedIds: new Set(),
				ability: STARTING_ABILITY,
				topicStats: new Map(),
				priorMastery,
			});

			const firstQuestion = first
				? quiz.questions.find((q) => q.id === first.id)
				: undefined;

			return {
				attempt,
				questions: firstQuestion ? [toClientQuestion(firstQuestion)] : [],
				isAdaptive: true as const,
				totalQuestions: target,
			};
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
				attempt.quiz.difficulty === "hard" &&
				graded.percentage >= MASTERY_SCORE;

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
