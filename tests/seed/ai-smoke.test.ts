import { generateObject, generateText } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { TUTOR_SYSTEM_PROMPT, tutorModel } from "@/lib/ai/tutor";

/**
 * Live smoke test for the configured AI provider. Guarded behind AI_SMOKE=true
 * so it never runs in CI (it makes real network calls + costs quota).
 *   $env:AI_SMOKE="true"; npm run with-dev-env -- vitest run tests/seed/ai-smoke.test.ts
 */
describe.runIf(process.env.AI_SMOKE === "true")(
	"AI provider smoke test",
	() => {
		it("streams a chat reply", async () => {
			const { text } = await generateText({
				model: tutorModel(),
				system: TUTOR_SYSTEM_PROMPT,
				prompt: "Reply with exactly: TUTOR_OK",
			});
			console.log("CHAT:", text);
			expect(text.length).toBeGreaterThan(0);
		});

		it("generates structured output (the quiz/topic path)", async () => {
			const { object } = await generateObject({
				model: tutorModel(),
				system: TUTOR_SYSTEM_PROMPT,
				schema: z.object({
					questions: z
						.array(
							z.object({
								prompt: z.string(),
								options: z.array(z.string()),
								correctAnswer: z.string(),
							}),
						)
						.min(1),
				}),
				prompt:
					"Create 2 easy multiple-choice questions about photosynthesis. Each has 4 options and one correct answer.",
			});
			console.log("QUIZ:", JSON.stringify(object, null, 2));
			expect(object.questions.length).toBeGreaterThan(0);
		}, 30000);
	},
);
