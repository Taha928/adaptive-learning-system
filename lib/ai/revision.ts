import type { Difficulty } from "@/lib/ai/tutor";

/**
 * Stage progression for a revision session: clear Easy, then Medium, then Hard.
 *
 * This is session STRUCTURE, not a second adaptive engine. It decides which
 * slice of the pool is eligible right now; `selectNextQuestion` in adaptive.ts
 * still does the choosing within that slice, still on ability and topic, and
 * grading and mastery are untouched. Narrowing the candidate list is exactly
 * what pinning a difficulty already does — this just moves the pin as the
 * student earns it.
 *
 * Why a ladder here and a floating level in assessments: an assessment is
 * measuring you, so it should converge on your edge as fast as it can. Revision
 * is teaching you, and a visible "Easy done, on to Medium" is the progress an
 * assessment must hide.
 *
 * Everything is derived from the answer history, so a session is replayable and
 * nothing about the stage needs storing.
 */

export const REVISION_STAGES = ["easy", "medium", "hard"] as const;

/** Share of a stage's questions that must be right before moving up. */
const STAGE_PASS_RATIO = 0.7;

/**
 * Hard ceiling on a stage, as a multiple of its target length. Without it a
 * student who cannot reach the pass ratio would be held at Easy forever, which
 * is demoralising and pointless — at some point the answer is to move on and
 * let the report say the topic needs work.
 */
const STAGE_ATTEMPT_MULTIPLIER = 2;

/** Smallest number of questions a stage can ask before it will let you pass. */
const MIN_PER_STAGE = 2;

export type StageOutcome = {
	stage: Difficulty;
	answered: number;
	correct: number;
	complete: boolean;
	/** Reached the pass ratio, as opposed to being let through by the ceiling. */
	passed: boolean;
};

export type RevisionProgress = {
	stages: StageOutcome[];
	/** null once every stage is done — the session is over. */
	currentStage: Difficulty | null;
	/** Questions answered in the current stage. */
	answeredInStage: number;
	/** Target for the current stage (it may run longer if answers are wrong). */
	perStage: number;
};

export type AnswerRecord = { level: Difficulty; isCorrect: boolean };

/** Questions each stage aims for, derived from the length the student chose. */
export function perStageFor(sessionLength: number): number {
	return Math.max(MIN_PER_STAGE, Math.ceil(sessionLength / REVISION_STAGES.length));
}

export function isStageComplete(
	answered: number,
	correct: number,
	perStage: number,
): boolean {
	if (answered < perStage) return false;
	if (correct / answered >= STAGE_PASS_RATIO) return true;
	// Not good enough, but they have practised enough. Let them move on.
	return answered >= perStage * STAGE_ATTEMPT_MULTIPLIER;
}

/** Where the session stands, derived purely from what has been answered. */
export function revisionProgress(
	history: AnswerRecord[],
	perStage: number,
): RevisionProgress {
	const stages: StageOutcome[] = REVISION_STAGES.map((stage) => {
		const inStage = history.filter((h) => h.level === stage);
		const correct = inStage.filter((h) => h.isCorrect).length;
		const answered = inStage.length;
		return {
			stage,
			answered,
			correct,
			complete: isStageComplete(answered, correct, perStage),
			passed: answered > 0 && correct / answered >= STAGE_PASS_RATIO,
		};
	});

	const current = stages.find((s) => !s.complete)?.stage ?? null;

	return {
		stages,
		currentStage: current,
		answeredInStage: current
			? (stages.find((s) => s.stage === current)?.answered ?? 0)
			: 0,
		perStage,
	};
}

/**
 * The stage the answer just now completed, if any, and what follows it. Drives
 * the "Easy Revision Completed -> Continue to Medium" gate, and is derived by
 * asking where the session stood one answer ago.
 */
export function stageTransition(
	history: AnswerRecord[],
	perStage: number,
): { justCompleted: Difficulty | null; nextStage: Difficulty | null } {
	if (history.length === 0) return { justCompleted: null, nextStage: null };

	const before = revisionProgress(history.slice(0, -1), perStage).currentStage;
	const after = revisionProgress(history, perStage).currentStage;

	if (before === after) return { justCompleted: null, nextStage: null };
	return { justCompleted: before, nextStage: after };
}

/** Whole session finished — every stage complete. */
export function isSessionComplete(
	history: AnswerRecord[],
	perStage: number,
): boolean {
	return revisionProgress(history, perStage).currentStage === null;
}
