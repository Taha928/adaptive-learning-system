import type { Prisma } from "@prisma/client";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { retrieveContext } from "@/lib/ai/retrieval";
import { linkStepsToTopics } from "@/lib/ai/topic-matching";
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** A roadmap needs breadth across the course, not depth on one point. */
const PLAN_TOP_K = 8;
const PLAN_CONTEXT_CHARS = 8_000;

/**
 * Shared study-plan generation logic.
 *
 * Used by both the tRPC `generatePlan` mutation (interactive, per-request) and
 * the nightly Vercel Cron route (`/api/cron/refresh-plans`) that autonomously
 * regenerates active plans. Keeping the LLM call + persistence in one place
 * guarantees the two paths produce identical, org-scoped output (SRS R8/R9).
 */

// Shape the LLM must return: an ordered roadmap of study items.
export const studyPlanGenerationSchema = z.object({
	title: z.string().describe("A short, motivating title for the study plan"),
	goal: z
		.string()
		.describe("A one-sentence summary of what the learner will achieve"),
	items: z
		.array(
			z.object({
				title: z
					.string()
					.describe(
						"The study step. When it maps to a provided topic, use that topic's exact title.",
					),
				topicTitle: z
					.string()
					.nullable()
					.describe(
						"If this step corresponds to one of the provided course topics, repeat its exact title here so it can be linked.",
					),
			}),
		)
		.min(1)
		.max(40)
		.describe(
			"Ordered study steps. Must include one step for EVERY provided course topic — none may be left out — plus an optional final review step.",
		),
});

export type StudyPlanGeneration = z.infer<typeof studyPlanGenerationSchema>;

type TopicLite = {
	id: string;
	title: string;
	summary: string | null;
};

/**
 * Gather the learner's weak topics (low / no recorded mastery) plus all
 * available topics for the given course scope, all strictly org-scoped.
 */
export async function gatherLearnerContext(params: {
	organizationId: string;
	userId: string;
	courseId?: string | null;
}): Promise<{ topics: TopicLite[]; weakTopicIds: Set<string> }> {
	const { organizationId, userId, courseId } = params;

	const topicWhere: Prisma.TopicWhereInput = { organizationId };
	if (courseId) {
		topicWhere.courseId = courseId;
	}

	const topics = await prisma.topic.findMany({
		where: topicWhere,
		select: { id: true, title: true, summary: true },
		orderBy: { orderIndex: "asc" },
		take: 100,
	});

	// Latest mastery per topic from this user's performance logs (org-scoped).
	const logs = await prisma.performanceLog.findMany({
		where: {
			organizationId,
			userId,
			...(courseId ? { courseId } : {}),
			topicId: { not: null },
			masteryScore: { not: null },
		},
		select: { topicId: true, masteryScore: true, occurredAt: true },
		orderBy: { occurredAt: "desc" },
	});

	const latestMastery = new Map<string, number>();
	for (const log of logs) {
		if (log.topicId && !latestMastery.has(log.topicId)) {
			latestMastery.set(log.topicId, log.masteryScore ?? 0);
		}
	}

	// Weak = no recorded mastery, or mastery below 0.5.
	const weakTopicIds = new Set<string>();
	for (const topic of topics) {
		const mastery = latestMastery.get(topic.id);
		if (mastery == null || mastery < 0.5) {
			weakTopicIds.add(topic.id);
		}
	}

	return { topics, weakTopicIds };
}

function buildPrompt(params: {
	goal?: string | null;
	topics: TopicLite[];
	weakTopicIds: Set<string>;
	context?: string;
}): string {
	const { goal, topics, weakTopicIds, context } = params;

	const weakLines = topics
		.filter((t) => weakTopicIds.has(t.id))
		.map((t) => `- ${t.title}${t.summary ? `: ${t.summary}` : ""}`);

	const allLines = topics.map(
		(t) => `- ${t.title}${t.summary ? `: ${t.summary}` : ""}`,
	);

	return [
		goal
			? `The learner's stated goal: ${goal}`
			: "The learner has not stated a specific goal; infer a sensible one.",
		"",
		context
			? `Excerpts from the course material most relevant to the learner's goal and weak areas. Use them to make each step concrete and specific to what this course actually teaches, rather than generic advice:\n\n${context}\n`
			: "",
		weakLines.length > 0
			? `Topics the learner is weakest on (prioritise these earliest):\n${weakLines.join("\n")}`
			: "No clear weak topics were detected from performance history.",
		"",
		allLines.length > 0
			? `All ${allLines.length} topics in this course:\n${allLines.join("\n")}`
			: "No course topics are available; create a sensible generic roadmap toward the goal.",
		"",
		"Produce an ordered study roadmap for THIS COURSE ONLY.",
		"",
		allLines.length > 0
			? [
					`COVERAGE IS MANDATORY: the plan must contain one step for every one of`,
					`the ${allLines.length} topics listed above. Do not omit, merge or skip any`,
					"topic, however easy it looks. Order them so the weakest areas come",
					"first and the rest follow in a sensible learning sequence, then you may",
					"add a single final consolidation/review step.",
					"",
					"For every step that corresponds to a topic above, set topicTitle to that",
					"topic's EXACT title, character for character, so it can be linked. Do",
					"not paraphrase or reword the title.",
				].join("\n")
			: "Build up to mastery and finish with consolidation/review.",
	].join("\n");
}

/**
 * Call the LLM to produce a structured roadmap. Pure I/O against the model —
 * no persistence — so callers control the transaction boundary.
 */
export async function generatePlanContent(params: {
	organizationId: string;
	userId: string;
	courseId?: string | null;
	goal?: string | null;
}): Promise<{
	generated: StudyPlanGeneration;
	topics: TopicLite[];
}> {
	const { topics, weakTopicIds } = await gatherLearnerContext(params);

	// Ground the roadmap in what the course actually covers. The query is the
	// learner's goal plus the topics they are weakest on, so retrieval surfaces
	// the material the plan should steer them toward first.
	//
	// Which topics are weak still comes from gatherLearnerContext's mastery
	// history — retrieval only decides what the steps say, never their order or
	// priority.
	let context = "";
	try {
		const weakTitles = topics
			.filter((t) => weakTopicIds.has(t.id))
			.slice(0, 8)
			.map((t) => t.title);
		const query = [params.goal, ...weakTitles].filter(Boolean).join(". ");
		if (query.trim()) {
			({ context } = await retrieveContext({
				organizationId: params.organizationId,
				courseId: params.courseId,
				query,
				topK: PLAN_TOP_K,
				maxChars: PLAN_CONTEXT_CHARS,
			}));
		}
	} catch (error) {
		// A plan built from topic titles alone is still a usable plan; a failed
		// retrieval must not stop the learner getting one.
		logger.warn(
			{ error, organizationId: params.organizationId },
			"Retrieval failed for study plan; building from topics alone",
		);
	}

	const { object } = await generateObject({
		model: tutorModel(),
		schema: studyPlanGenerationSchema,
		system: TUTOR_SYSTEM_PROMPT,
		prompt: buildPrompt({ goal: params.goal, topics, weakTopicIds, context }),
	});

	return { generated: object, topics };
}

/**
 * Map AI-generated items to StudyPlanItem create rows, linking each step to the
 * topic it refers to.
 *
 * Matching is by meaning, not by characters — see lib/ai/topic-matching.ts. The
 * previous exact-title lookup silently produced `topicId: null` on any
 * paraphrase, leaving plan steps with nothing to open.
 *
 * Async because the fallback pass may embed; it does not for typical plans,
 * where the lexical pass places everything.
 */
export async function buildItemRows(params: {
	organizationId: string;
	studyPlanId: string;
	generated: StudyPlanGeneration;
	topics: TopicLite[];
}): Promise<Prisma.StudyPlanItemCreateManyInput[]> {
	const { organizationId, studyPlanId, generated, topics } = params;

	// The model is asked to echo the topic in `topicTitle`; when it does, that is
	// the cleanest signal. When it leaves it null, the step's own title still
	// usually names the topic, so fall back to that rather than giving up.
	const steps = generated.items.map(
		(item) => item.topicTitle?.trim() || item.title,
	);

	const topicIds = await linkStepsToTopics({
		steps,
		topics: topics.map((t) => ({ id: t.id, title: t.title })),
	});

	return generated.items.map((item, index) => ({
		organizationId,
		studyPlanId,
		topicId: topicIds[index] ?? null,
		title: item.title,
		orderIndex: index,
	}));
}
