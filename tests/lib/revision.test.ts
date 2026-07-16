import { describe, expect, it } from "vitest";
import {
	type AnswerRecord,
	isSessionComplete,
	isStageComplete,
	perStageFor,
	revisionProgress,
	stageTransition,
} from "@/lib/ai/revision";

const answers = (level: "easy" | "medium" | "hard", n: number, correct: number) =>
	Array.from({ length: n }, (_, i) => ({ level, isCorrect: i < correct })) as AnswerRecord[];

describe("perStageFor", () => {
	it("splits the chosen length across the three stages", () => {
		expect(perStageFor(9)).toBe(3);
		expect(perStageFor(12)).toBe(4);
	});

	it("never asks fewer than two questions in a stage", () => {
		// A 5-question session would otherwise put ~1.6 in each stage, and one
		// question is not evidence of anything.
		expect(perStageFor(5)).toBe(2);
		expect(perStageFor(1)).toBe(2);
	});
});

describe("isStageComplete", () => {
	it("holds you in the stage until you have answered enough", () => {
		expect(isStageComplete(2, 2, 3)).toBe(false);
	});

	it("passes you once you hit the target at 70% or better", () => {
		expect(isStageComplete(3, 3, 3)).toBe(true);
		expect(isStageComplete(3, 2, 3)).toBe(false); // 67% — not yet
		expect(isStageComplete(4, 3, 3)).toBe(true); // 75%
	});

	it("lets a struggling student through at the ceiling rather than trapping them", () => {
		expect(isStageComplete(5, 0, 3)).toBe(false);
		expect(isStageComplete(6, 0, 3)).toBe(true); // perStage * 2
	});
});

describe("revisionProgress", () => {
	it("starts on easy", () => {
		expect(revisionProgress([], 3).currentStage).toBe("easy");
	});

	it("stays on easy while the student is getting them wrong", () => {
		const p = revisionProgress(answers("easy", 3, 1), 3);
		expect(p.currentStage).toBe("easy");
		expect(p.answeredInStage).toBe(3);
	});

	it("moves to medium once easy is cleared", () => {
		expect(revisionProgress(answers("easy", 3, 3), 3).currentStage).toBe("medium");
	});

	it("moves to hard once easy and medium are cleared", () => {
		const history = [...answers("easy", 3, 3), ...answers("medium", 3, 3)];
		expect(revisionProgress(history, 3).currentStage).toBe("hard");
	});

	it("ends the session once hard is cleared", () => {
		const history = [
			...answers("easy", 3, 3),
			...answers("medium", 3, 3),
			...answers("hard", 3, 3),
		];
		expect(revisionProgress(history, 3).currentStage).toBeNull();
		expect(isSessionComplete(history, 3)).toBe(true);
	});

	it("reports which stages were genuinely passed rather than timed out", () => {
		// Six wrong answers at easy: complete (ceiling), but not passed.
		const p = revisionProgress(answers("easy", 6, 0), 3);
		const easy = p.stages.find((s) => s.stage === "easy")!;
		expect(easy.complete).toBe(true);
		expect(easy.passed).toBe(false);
		expect(p.currentStage).toBe("medium");
	});
});

describe("stageTransition", () => {
	it("reports nothing mid-stage", () => {
		expect(stageTransition(answers("easy", 2, 2), 3)).toEqual({
			justCompleted: null,
			nextStage: null,
		});
	});

	it("fires exactly on the answer that clears easy", () => {
		expect(stageTransition(answers("easy", 3, 3), 3)).toEqual({
			justCompleted: "easy",
			nextStage: "medium",
		});
	});

	it("fires on the answer that clears medium", () => {
		const history = [...answers("easy", 3, 3), ...answers("medium", 3, 3)];
		expect(stageTransition(history, 3)).toEqual({
			justCompleted: "medium",
			nextStage: "hard",
		});
	});

	it("reports the end of the session after hard", () => {
		const history = [
			...answers("easy", 3, 3),
			...answers("medium", 3, 3),
			...answers("hard", 3, 3),
		];
		expect(stageTransition(history, 3)).toEqual({
			justCompleted: "hard",
			nextStage: null,
		});
	});

	it("does not re-fire on the answer after a transition", () => {
		const history = [...answers("easy", 3, 3), ...answers("medium", 1, 1)];
		expect(stageTransition(history, 3).justCompleted).toBeNull();
	});

	it("is silent on an empty history", () => {
		expect(stageTransition([], 3)).toEqual({
			justCompleted: null,
			nextStage: null,
		});
	});
});

describe("a whole session, replayed", () => {
	it("walks easy -> medium -> hard for a student who keeps getting them right", () => {
		const history: AnswerRecord[] = [];
		const seen: string[] = [];

		for (let i = 0; i < 9; i++) {
			const stage = revisionProgress(history, 3).currentStage;
			if (!stage) break;
			seen.push(stage);
			history.push({ level: stage, isCorrect: true });
		}

		expect(seen).toEqual([
			"easy",
			"easy",
			"easy",
			"medium",
			"medium",
			"medium",
			"hard",
			"hard",
			"hard",
		]);
		expect(isSessionComplete(history, 3)).toBe(true);
	});

	it("gives a struggling student extra practice before letting them move on", () => {
		const history: AnswerRecord[] = [];
		const seen: string[] = [];

		// Wrong on everything: each stage should run to its ceiling (6), not its
		// target (3), so they practise more before progressing.
		for (let i = 0; i < 30; i++) {
			const stage = revisionProgress(history, 3).currentStage;
			if (!stage) break;
			seen.push(stage);
			history.push({ level: stage, isCorrect: false });
		}

		expect(seen.filter((s) => s === "easy")).toHaveLength(6);
		expect(seen.filter((s) => s === "medium")).toHaveLength(6);
		expect(seen.filter((s) => s === "hard")).toHaveLength(6);
		expect(isSessionComplete(history, 3)).toBe(true);
	});
});
