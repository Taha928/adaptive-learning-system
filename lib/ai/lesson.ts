import { generateObject } from "ai";
import { z } from "zod/v4";
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";

/**
 * AI lesson generation — the "teach" step of the learning loop.
 *
 * Before this existed the product went straight from a topic to a quiz, so a
 * student was tested on material they had never been taught. This produces the
 * actual teaching content for a single topic.
 *
 * Rendering: the lesson body is markdown rendered by `streamdown` (the same
 * renderer the AI chat uses). That gives us GFM tables, Shiki-highlighted code
 * and KaTeX math for free. It does NOT give us mermaid — the package is not
 * installed — so the prompt asks for ASCII/text figures inside fenced code
 * blocks instead, which always render.
 *
 * NOTE on the schema: OpenAI structured output runs in strict mode, which
 * requires every property to be present in `required` and forbids defaults.
 * Never use `.optional()` or `.default()` here — use `.nullable()` if a value
 * may be absent.
 */

export const lessonSchema = z.object({
	hook: z
		.string()
		.describe(
			"One or two sentences that make the student care about this topic. Concrete and human, not 'in this lesson we will'.",
		),
	explanation: z
		.string()
		.describe(
			"The main teaching, in markdown. Build up from first principles in short paragraphs with ## sub-headings. Use KaTeX for any formula: $inline$ or $$display$$. Where a diagram helps, draw an ASCII figure inside a ```text fenced block. Use markdown tables to compare things. Aim for 400-700 words.",
		),
	keyConcepts: z
		.array(
			z.object({
				term: z.string().describe("The concept or term"),
				meaning: z
					.string()
					.describe("A plain-language definition a beginner would understand"),
			}),
		)
		.min(2)
		.max(6)
		.describe("The handful of ideas the student must not leave without"),
	figure: z
		.object({
			caption: z
				.string()
				.describe("One line saying what the figure shows, e.g. 'How a packet crosses a firewall'"),
			diagram: z
				.string()
				.describe(
					"A labelled diagram drawn with plain text and box-drawing characters, rendered in a monospace block. Use arrows (->, |, v) and boxes to show structure, flow or relationships. Keep it under 70 characters wide so it never wraps. Do NOT wrap it in backticks — it is rendered as-is.",
				),
			takeaway: z
				.string()
				.describe("The one thing the student should notice in the figure"),
		})
		.describe(
			"A visual for the topic. Required — every lesson gets one, because a picture carries structure that prose cannot.",
		),
	examples: z
		.array(
			z.object({
				title: z.string().describe("Short label for the example"),
				walkthrough: z
					.string()
					.describe(
						"A worked example in markdown, solved step by step so the student can follow the reasoning. Use KaTeX for maths.",
					),
			}),
		)
		.min(1)
		.max(3)
		.describe("Worked examples, simplest first"),
	analogy: z
		.string()
		.describe(
			"An everyday analogy that makes the core idea click. Concrete and memorable.",
		),
	misconceptions: z
		.array(
			z.object({
				mistake: z.string().describe("What students commonly get wrong"),
				correction: z.string().describe("What is actually true, and why"),
			}),
		)
		.min(1)
		.max(4)
		.describe("Common mistakes, stated as mistake -> correction"),
	memoryTricks: z
		.array(z.string())
		.min(1)
		.max(3)
		.describe("Mnemonics or memory hooks for the hardest details"),
	recap: z
		.array(z.string())
		.min(2)
		.max(5)
		.describe("The lesson compressed into a few one-line takeaways"),
});

export type Lesson = z.infer<typeof lessonSchema>;

/**
 * Generate a full lesson for a topic, grounded ONLY in the supplied source
 * text. Bounded to keep us inside a predictable token budget, matching the
 * limits used by topic segmentation and quiz generation.
 */
export async function generateLesson(params: {
	topicTitle: string;
	topicSummary: string | null;
	sourceText: string | null;
}): Promise<Lesson> {
	const { topicTitle, topicSummary, sourceText } = params;

	const source = [topicSummary, sourceText]
		.filter((part): part is string => Boolean(part?.trim()))
		.join("\n\n")
		.slice(0, 12000);

	const { object } = await generateObject({
		model: tutorModel(),
		schema: lessonSchema,
		system: TUTOR_SYSTEM_PROMPT,
		prompt: [
			`Teach the topic "${topicTitle}" to a student meeting it for the first time.`,
			"",
			"You are writing a lesson, not a summary. Explain, do not list. Assume the",
			"student is capable but has no background: define jargon the first time it",
			"appears, and show the reasoning rather than asserting conclusions.",
			"",
			"Formatting rules:",
			"- The explanation is markdown. Use ## sub-headings to break it up.",
			"- Write formulas as KaTeX: $E = mc^2$ inline, or $$...$$ on its own line.",
			"  Do this for EVERY formula — never write maths as plain text.",
			"- Use a markdown table when comparing two or more things.",
			"- Do NOT use mermaid anywhere; it will not render.",
			"",
			"The `figure` field is a text diagram drawn with box-drawing characters",
			"and arrows, shown in a monospace block. Draw the structure of the idea —",
			"a flow, a hierarchy, a before/after, a labelled anatomy. Example shape:",
			"",
			"    ┌──────────┐      ┌──────────┐",
			"    │  Sender  │ ───> │ Receiver │",
			"    └──────────┘      └──────────┘",
			"",
			"Keep it under 70 characters wide and do not wrap it in backticks.",
			"",
			source
				? `Base the lesson ONLY on the study material below. Do not introduce facts that are not supported by it.\n\n---\n${source}\n---`
				: "No source material was provided; teach the topic from general knowledge, staying introductory.",
		].join("\n"),
	});

	return object;
}
