import { openai } from "@ai-sdk/openai";
import { DEFAULT_CHAT_MODEL } from "@/config/billing.config";

/**
 * Central AI configuration for the Personalized Learning Tutor Agent.
 * All tutor features (chat, quiz generation, study plans) resolve their model
 * and persona through here so behaviour stays consistent.
 *
 * Uses OpenAI via @ai-sdk/openai (reads OPENAI_API_KEY). generateObject
 * (quizzes/topics/plans) works against OpenAI's structured-output support.
 */

export const TUTOR_SYSTEM_PROMPT = `You are an adaptive personal learning tutor.
Explain concepts clearly with concrete examples. When a student is stuck, give
guiding hints rather than the full answer. Adjust the depth of your explanations
to the student's demonstrated level of understanding. Be encouraging, patient,
and concise.`;

/** Resolve the OpenAI model used for tutor tasks (chat + generation). */
export function tutorModel(modelId: string = DEFAULT_CHAT_MODEL) {
	return openai(modelId);
}

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Deterministic difficulty selection from a mastery score in [0, 1].
 * Kept pure (no I/O) so it is unit-testable and defensible in a viva — the
 * LLM generates *content*, this rule decides the *level*.
 */
export function nextDifficulty(mastery: number): Difficulty {
	if (mastery < 0.5) return "easy";
	if (mastery < 0.8) return "medium";
	return "hard";
}

/**
 * Exponential moving average mastery update. `previous` and `latest` are both
 * fractions in [0, 1]; recent performance is weighted more heavily so the
 * tutor adapts quickly while smoothing out one-off results.
 */
export function updateMastery(
	previous: number | null | undefined,
	latest: number,
): number {
	const clamped = Math.max(0, Math.min(1, latest));
	if (previous == null) return clamped;
	const prevClamped = Math.max(0, Math.min(1, previous));
	return Number((0.6 * prevClamped + 0.4 * clamped).toFixed(4));
}
