import { QuestionType, QuizDifficulty, QuizStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const ORG_ID = "0c99fb5b-75ad-4d18-a85f-1e729ccf8bec";
const TOPIC_ID = "a28190b9-cbc1-4708-8108-cf65abc292d6";

describe.runIf(process.env.DEBUG_QUIZ === "true")("quiz create debug", () => {
	it("reproduces the quiz.create validation error", async () => {
		const topic = await prisma.topic.findFirst({
			where: { id: TOPIC_ID, organizationId: ORG_ID },
			select: { id: true, courseId: true, title: true },
		});
		// biome-ignore lint/suspicious/noConsole: debug
		console.log("TOPIC:", topic);
		expect(topic).toBeTruthy();
		if (!topic) return;

		// biome-ignore lint/suspicious/noConsole: debug
		console.log("RUNTIME ENUM QuestionType.multipleChoice =", QuestionType.multipleChoice);

		for (const candidate of ["multipleChoice", "multiple_choice"]) {
			try {
				const q = await prisma.question.create({
					data: {
						organizationId: ORG_ID,
						quiz: {
							create: {
								organizationId: ORG_ID,
								courseId: topic.courseId,
								topicId: topic.id,
								title: `Debug ${candidate}`,
								difficulty: QuizDifficulty.medium,
								status: QuizStatus.draft,
							},
						},
						prompt: "Q?",
						// biome-ignore lint/suspicious/noExplicitAny: probing enum value
						type: candidate as any,
						options: ["a", "b"],
						correctAnswer: "a",
						points: 1,
						orderIndex: 0,
					},
					select: { id: true, quizId: true },
				});
				// biome-ignore lint/suspicious/noConsole: debug
				console.log(`ACCEPTED type="${candidate}"`);
				await prisma.quiz.delete({ where: { id: q.quizId } });
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: debug
				console.log(
					`REJECTED type="${candidate}": ${error instanceof Error ? error.message.split("\n").pop() : String(error)}`,
				);
			}
		}
	});
});
