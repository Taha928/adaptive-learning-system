import { describe, expect, it } from "vitest";
import {
	abilityFromHistory,
	buildMasteryReport,
	type PoolQuestion,
	recordTopicResult,
	selectNextQuestion,
	STARTING_ABILITY,
	type TopicStat,
	targetDifficulty,
	updateAbility,
} from "@/lib/ai/adaptive";

describe("updateAbility", () => {
	it("increases on a correct answer and decreases on a wrong one", () => {
		expect(updateAbility(0.5, "medium", true)).toBeGreaterThan(0.5);
		expect(updateAbility(0.5, "medium", false)).toBeLessThan(0.5);
	});

	it("rewards a correct answer above your level more than one below it", () => {
		const gainOnHard = updateAbility(0.5, "hard", true) - 0.5;
		const gainOnEasy = updateAbility(0.5, "easy", true) - 0.5;
		expect(gainOnHard).toBeGreaterThan(gainOnEasy);
	});

	it("only reduces slightly when a hard question is missed, but punishes an easy miss", () => {
		const dropOnHard = 0.5 - updateAbility(0.5, "hard", false);
		const dropOnEasy = 0.5 - updateAbility(0.5, "easy", false);
		expect(dropOnHard).toBeGreaterThan(0);
		expect(dropOnEasy).toBeGreaterThan(dropOnHard);
	});

	it("stays within [0, 1] however lopsided the run", () => {
		let low = 0.5;
		let high = 0.5;
		for (let i = 0; i < 50; i++) {
			low = updateAbility(low, "easy", false);
			high = updateAbility(high, "hard", true);
		}
		expect(low).toBeGreaterThanOrEqual(0);
		expect(high).toBeLessThanOrEqual(1);
	});
});

describe("abilityFromHistory", () => {
	it("returns the starting ability for an empty history", () => {
		expect(abilityFromHistory([])).toBe(STARTING_ABILITY);
	});

	it("climbs out of the easy band after a run of correct answers", () => {
		const ability = abilityFromHistory([
			{ level: "medium", isCorrect: true },
			{ level: "medium", isCorrect: true },
			{ level: "hard", isCorrect: true },
		]);
		expect(targetDifficulty(ability)).toBe("hard");
	});

	it("drops to easy after a run of wrong answers", () => {
		const ability = abilityFromHistory([
			{ level: "easy", isCorrect: false },
			{ level: "easy", isCorrect: false },
		]);
		expect(targetDifficulty(ability)).toBe("easy");
	});

	it("is deterministic — the same answers always give the same estimate", () => {
		const history = [
			{ level: "easy", isCorrect: true },
			{ level: "medium", isCorrect: false },
			{ level: "medium", isCorrect: true },
		] as const;
		expect(abilityFromHistory([...history])).toBe(abilityFromHistory([...history]));
	});
});

const pool = (): PoolQuestion[] => [
	{ id: "e-auth", difficulty: "easy", topicId: "auth", orderIndex: 0 },
	{ id: "m-auth", difficulty: "medium", topicId: "auth", orderIndex: 1 },
	{ id: "h-auth", difficulty: "hard", topicId: "auth", orderIndex: 2 },
	{ id: "e-enc", difficulty: "easy", topicId: "enc", orderIndex: 3 },
	{ id: "m-enc", difficulty: "medium", topicId: "enc", orderIndex: 4 },
	{ id: "h-enc", difficulty: "hard", topicId: "enc", orderIndex: 5 },
];

describe("selectNextQuestion", () => {
	it("serves a harder question as ability rises", () => {
		const low = selectNextQuestion({
			pool: pool(),
			askedIds: new Set(),
			ability: 0.2,
			topicStats: new Map(),
			priorMastery: new Map(),
		});
		const high = selectNextQuestion({
			pool: pool(),
			askedIds: new Set(),
			ability: 0.95,
			topicStats: new Map(),
			priorMastery: new Map(),
		});
		expect(low?.difficulty).toBe("easy");
		expect(high?.difficulty).toBe("hard");
	});

	it("never repeats a question already asked", () => {
		const asked = new Set(["e-auth", "e-enc"]);
		const picked = selectNextQuestion({
			pool: pool(),
			askedIds: asked,
			ability: 0.2,
			topicStats: new Map(),
			priorMastery: new Map(),
		});
		expect(picked).not.toBeNull();
		expect(asked.has(picked!.id)).toBe(false);
	});

	it("returns null once the pool is exhausted", () => {
		expect(
			selectNextQuestion({
				pool: pool(),
				askedIds: new Set(pool().map((q) => q.id)),
				ability: 0.5,
				topicStats: new Map(),
				priorMastery: new Map(),
			}),
		).toBeNull();
	});

	// The spec's example: wrong twice on Authentication -> chase Authentication.
	it("prioritises a topic the student is getting wrong", () => {
		const topicStats = new Map<string, TopicStat>([
			["auth", { asked: 2, correct: 0, wrong: 2 }],
		]);
		const picked = selectNextQuestion({
			pool: pool(),
			askedIds: new Set(["e-auth", "m-auth"]),
			ability: 0.5,
			topicStats,
			priorMastery: new Map(),
		});
		expect(picked?.topicId).toBe("auth");
	});

	// The spec's other example: Encryption already mastered -> ask less of it.
	it("deprioritises a topic the student has already mastered", () => {
		const picked = selectNextQuestion({
			pool: pool(),
			askedIds: new Set(),
			ability: 0.25,
			topicStats: new Map(),
			priorMastery: new Map([
				["enc", 0.95],
				["auth", 0.2],
			]),
		});
		expect(picked?.topicId).toBe("auth");
	});

	it("spreads across topics rather than collapsing onto one", () => {
		// Same ability, no struggle signal: saturation should push it off `auth`
		// once auth has been asked repeatedly.
		const topicStats = new Map<string, TopicStat>([
			["auth", { asked: 2, correct: 2, wrong: 0 }],
		]);
		const picked = selectNextQuestion({
			pool: pool(),
			askedIds: new Set(["e-auth", "m-auth"]),
			ability: 0.25,
			topicStats,
			priorMastery: new Map(),
		});
		expect(picked?.topicId).toBe("enc");
	});
});

describe("recordTopicResult", () => {
	it("tallies correct and wrong per topic without mutating the input", () => {
		const start = new Map<string, TopicStat>();
		const after = recordTopicResult(
			recordTopicResult(start, "auth", false),
			"auth",
			true,
		);
		expect(start.size).toBe(0);
		expect(after.get("auth")).toEqual({ asked: 2, correct: 1, wrong: 1 });
	});

	it("ignores answers with no topic attribution", () => {
		expect(recordTopicResult(new Map(), null, true).size).toBe(0);
	});
});

describe("buildMasteryReport", () => {
	it("splits topics into strong and weak by hit rate", () => {
		const report = buildMasteryReport([
			{ topicId: "enc", topicTitle: "Encryption", isCorrect: true },
			{ topicId: "enc", topicTitle: "Encryption", isCorrect: true },
			{ topicId: "auth", topicTitle: "Authentication", isCorrect: false },
			{ topicId: "auth", topicTitle: "Authentication", isCorrect: false },
		]);

		expect(report.strong.map((t) => t.topicTitle)).toEqual(["Encryption"]);
		expect(report.weak.map((t) => t.topicTitle)).toEqual(["Authentication"]);
		expect(report.recommendation).toContain("Authentication");
	});

	it("reports a middling topic as neither strong nor weak", () => {
		const report = buildMasteryReport([
			{ topicId: "t", topicTitle: "Topic", isCorrect: true },
			{ topicId: "t", topicTitle: "Topic", isCorrect: true },
			{ topicId: "t", topicTitle: "Topic", isCorrect: false },
		]);
		expect(report.strong).toHaveLength(0);
		expect(report.weak).toHaveLength(0);
	});

	it("orders weak areas worst-first", () => {
		const report = buildMasteryReport([
			// A: 1/3 correct. B: 0/2. Both below the weak threshold, B lower.
			{ topicId: "a", topicTitle: "A", isCorrect: true },
			{ topicId: "a", topicTitle: "A", isCorrect: false },
			{ topicId: "a", topicTitle: "A", isCorrect: false },
			{ topicId: "b", topicTitle: "B", isCorrect: false },
			{ topicId: "b", topicTitle: "B", isCorrect: false },
		]);
		expect(report.weak.map((t) => t.topicTitle)).toEqual(["B", "A"]);
	});

	it("treats an exactly-half score as neither weak nor strong", () => {
		const report = buildMasteryReport([
			{ topicId: "a", topicTitle: "A", isCorrect: true },
			{ topicId: "a", topicTitle: "A", isCorrect: false },
		]);
		expect(report.weak).toHaveLength(0);
		expect(report.strong).toHaveLength(0);
	});

	it("skips answers with no topic rather than inventing an area", () => {
		const report = buildMasteryReport([
			{ topicId: null, topicTitle: "Unknown topic", isCorrect: false },
		]);
		expect(report.strong).toHaveLength(0);
		expect(report.weak).toHaveLength(0);
	});
});

/**
 * A realistic pool: 3 topics x 3 levels x 2 copies. The spare copies matter —
 * with exactly one question per cell the last picks are forced by exhaustion
 * rather than chosen, which tests nothing.
 */
const richPool = (): PoolQuestion[] => {
	const out: PoolQuestion[] = [];
	let order = 0;
	for (const topicId of ["auth", "enc", "fw"]) {
		for (const difficulty of ["easy", "medium", "hard"] as const) {
			for (let copy = 0; copy < 2; copy++) {
				out.push({
					id: `${topicId}-${difficulty}-${copy}`,
					difficulty,
					topicId,
					orderIndex: order++,
				});
			}
		}
	}
	return out;
};

/** Replay a whole assessment against a student who is always right or always wrong. */
function runAssessment(alwaysCorrect: boolean, length: number): PoolQuestion[] {
	const served: PoolQuestion[] = [];
	const asked = new Set<string>();
	let stats = new Map<string, TopicStat>();
	const history: { level: "easy" | "medium" | "hard"; isCorrect: boolean }[] = [];

	for (let i = 0; i < length; i++) {
		const next = selectNextQuestion({
			pool: richPool(),
			askedIds: asked,
			ability: abilityFromHistory(history),
			topicStats: stats,
			priorMastery: new Map(),
		});
		if (!next) break;
		served.push(next);
		asked.add(next.id);
		stats = recordTopicResult(stats, next.topicId, alwaysCorrect);
		history.push({ level: next.difficulty, isCorrect: alwaysCorrect });
	}
	return served;
}

describe("the adaptive loop end to end", () => {
	it("climbs to hard for a student who answers everything correctly", () => {
		const served = runAssessment(true, 6);
		expect(served).toHaveLength(6);
		expect(served.at(-1)?.difficulty).toBe("hard");
		expect(served.some((q) => q.difficulty === "hard")).toBe(true);
	});

	it("never serves a hard question to a student who answers everything wrong", () => {
		const served = runAssessment(false, 6);
		expect(served).toHaveLength(6);
		expect(served.some((q) => q.difficulty === "hard")).toBe(false);
		// Mostly easy — not exclusively. Once a struggling topic's easy questions
		// are spent, the struggle term still pulls the engine back to that topic,
		// where the best remaining fit is medium. Chasing the weak topic is the
		// intended trade, so this asserts the balance rather than a pure floor.
		expect(served.filter((q) => q.difficulty === "easy").length).toBeGreaterThanOrEqual(4);
	});

	it("opens at the same question regardless of how the student later performs", () => {
		// Nothing is known at question 1, so both runs must start identically —
		// the divergence has to come from answers, not from the seed.
		expect(runAssessment(true, 6)[0]!.id).toBe(runAssessment(false, 6)[0]!.id);
	});

	it("spreads a 6-question assessment across more than one topic", () => {
		const topics = new Set(runAssessment(true, 6).map((q) => q.topicId));
		expect(topics.size).toBeGreaterThan(1);
	});
});
