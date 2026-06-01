import { generateObject, type ModelMessage } from "ai";
import { z } from "zod/v4";
import { tutorModel } from "@/lib/ai/tutor";

/**
 * AI grading for free-response quiz answers (short answers, long scenario
 * answers, and image submissions such as handwritten maths). The marking scale
 * is the same as the rest of the quiz — a question is either correct (full
 * points) or not — but the AI also returns short feedback for the student.
 */
const gradeSchema = z.object({
	isCorrect: z.boolean(),
	feedback: z.string(),
});

export type FreeResponseGrade = z.infer<typeof gradeSchema>;

export async function gradeFreeResponse(params: {
	prompt: string;
	correctAnswer: string;
	responseText?: string | null;
	responseImage?: string | null;
	isLong?: boolean;
}): Promise<FreeResponseGrade> {
	const { prompt, correctAnswer, responseText, responseImage, isLong } = params;

	// No answer at all — fail fast without spending an AI call.
	if (!responseText?.trim() && !responseImage) {
		return { isCorrect: false, feedback: "No answer was provided." };
	}

	const system = `You are grading a student's ${
		isLong ? "long, scenario-based" : "short"
	} answer to a quiz question.

Question: ${prompt}
Reference / model answer (rubric): ${correctAnswer}

Mark the answer correct if it captures the key idea; minor wording, spelling, or formatting differences are fine.${
		isLong
			? " For scenario answers, mark correct when the core reasoning and conclusion are sound, even if phrased differently."
			: ""
	} If the answer is an image (e.g. handwritten working or a diagram), read it carefully — this is common for maths. Then give one or two sentences of constructive, encouraging feedback addressed to the student.`;

	const userParts: Array<Record<string, unknown>> = [
		{
			type: "text",
			text: responseText?.trim()
				? `Student's answer: ${responseText.trim()}`
				: "The student submitted their answer as the attached image.",
		},
	];
	if (responseImage) {
		userParts.push({ type: "image", image: responseImage });
	}

	const messages = [
		{ role: "system", content: system },
		{ role: "user", content: userParts },
	] as unknown as ModelMessage[];

	const { object } = await generateObject({
		model: tutorModel(),
		schema: gradeSchema,
		messages,
	});

	return object;
}
