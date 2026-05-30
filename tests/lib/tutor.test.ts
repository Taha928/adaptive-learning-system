import { describe, expect, it } from "vitest";
import { nextDifficulty, updateMastery } from "@/lib/ai/tutor";

describe("nextDifficulty", () => {
	it("returns 'easy' for low mastery (< 0.5)", () => {
		expect(nextDifficulty(0)).toBe("easy");
		expect(nextDifficulty(0.3)).toBe("easy");
		expect(nextDifficulty(0.49)).toBe("easy");
	});

	it("returns 'medium' for mid mastery (0.5 - 0.8)", () => {
		expect(nextDifficulty(0.5)).toBe("medium");
		expect(nextDifficulty(0.65)).toBe("medium");
		expect(nextDifficulty(0.79)).toBe("medium");
	});

	it("returns 'hard' for high mastery (>= 0.8)", () => {
		expect(nextDifficulty(0.8)).toBe("hard");
		expect(nextDifficulty(0.95)).toBe("hard");
		expect(nextDifficulty(1)).toBe("hard");
	});

	it("escalates difficulty as mastery climbs across bands", () => {
		const progression = [0.2, 0.6, 0.9].map(nextDifficulty);
		expect(progression).toEqual(["easy", "medium", "hard"]);
	});
});

describe("updateMastery", () => {
	it("uses the latest score directly when there is no prior mastery", () => {
		expect(updateMastery(null, 0.7)).toBe(0.7);
		expect(updateMastery(undefined, 0.4)).toBe(0.4);
	});

	it("blends prior and latest with EMA (0.6 prev + 0.4 latest)", () => {
		// 0.6 * 0.5 + 0.4 * 1 = 0.7
		expect(updateMastery(0.5, 1)).toBe(0.7);
		// 0.6 * 0.8 + 0.4 * 0.3 = 0.6
		expect(updateMastery(0.8, 0.3)).toBe(0.6);
	});

	it("moves mastery up after a strong result and down after a weak one", () => {
		expect(updateMastery(0.5, 1)).toBeGreaterThan(0.5);
		expect(updateMastery(0.5, 0)).toBeLessThan(0.5);
	});

	it("clamps inputs into the [0, 1] range", () => {
		expect(updateMastery(2, 2)).toBe(1);
		expect(updateMastery(-1, -1)).toBe(0);
	});

	it("always returns a value within [0, 1]", () => {
		for (const prev of [0, 0.25, 0.5, 0.75, 1]) {
			for (const latest of [0, 0.5, 1]) {
				const result = updateMastery(prev, latest);
				expect(result).toBeGreaterThanOrEqual(0);
				expect(result).toBeLessThanOrEqual(1);
			}
		}
	});
});
