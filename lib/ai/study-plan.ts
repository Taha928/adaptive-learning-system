import type { Prisma } from "@prisma/client";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";
import { prisma } from "@/lib/db";

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
		.max(20)
		.describe("Ordered list of study steps, weakest areas first"),
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
}): string {
	const { goal, topics, weakTopicIds } = params;

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
		weakLines.length > 0
			? `Topics the learner is weakest on (prioritise these earliest):\n${weakLines.join("\n")}`
			: "No clear weak topics were detected from performance history.",
		"",
		allLines.length > 0
			? `All available course topics:\n${allLines.join("\n")}`
			: "No course topics are available; create a sensible generic roadmap toward the goal.",
		"",
		"Produce an ordered study roadmap. Start with the weakest areas, build up",
		"to mastery, and finish with consolidation/review. When a step maps to one",
		"of the available topics above, set its topicTitle to that topic's exact",
		"title so it can be linked.",
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

	const { object } = await generateObject({
		model: tutorModel(),
		schema: studyPlanGenerationSchema,
		system: TUTOR_SYSTEM_PROMPT,
		prompt: buildPrompt({ goal: params.goal, topics, weakTopicIds }),
	});

	return { generated: object, topics };
}

/**
 * Map AI-generated items to StudyPlanItem create rows, linking topicId when the
 * AI referenced a real topic by (case-insensitive) exact title.
 */
export function buildItemRows(params: {
	organizationId: string;
	studyPlanId: string;
	generated: StudyPlanGeneration;
	topics: TopicLite[];
}): Prisma.StudyPlanItemCreateManyInput[] {
	const { organizationId, studyPlanId, generated, topics } = params;

	const byTitle = new Map<string, string>();
	for (const t of topics) {
		byTitle.set(t.title.trim().toLowerCase(), t.id);
	}

	return generated.items.map((item, index) => {
		const key = (item.topicTitle ?? item.title).trim().toLowerCase();
		const topicId = byTitle.get(key) ?? null;
		return {
			organizationId,
			studyPlanId,
			topicId,
			title: item.title,
			orderIndex: index,
		};
	});
}
