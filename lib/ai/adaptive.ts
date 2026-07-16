import { type Difficulty, nextDifficulty } from "@/lib/ai/tutor";

/**
 * The adaptive assessment engine.
 *
 * Division of labour, mirroring the rest of the tutor: the LLM generates the
 * *content* (a pool of questions spanning difficulty x topic, produced in one
 * call up front), and the pure functions below decide *which* of them the
 * student sees next. Nothing here does I/O or calls a model, so a whole
 * assessment can be replayed and unit-tested deterministically — and there is
 * no model latency between questions.
 *
 * Difficulty is never surfaced to the student. It is an internal control
 * signal; exposing it turns a diagnostic into a label.
 */

/**
 * Where each level sits on the same 0..1 scale as ability, so the two can be
 * compared directly. These are the *midpoints* of the bands used by
 * nextDifficulty() (< 0.5 easy, < 0.8 medium, else hard).
 */
const DIFFICULTY_VALUE: Record<Difficulty, number> = {
	easy: 0.25,
	medium: 0.65,
	hard: 0.9,
};

/**
 * Opening ability. Deliberately "easy-medium": high enough that a capable
 * student is not insulted by three trivial questions, low enough that a
 * struggling one is not buried immediately.
 */
export const STARTING_ABILITY = 0.45;

/** How far one answer can move the estimate. Elo's K-factor. */
const K_FACTOR = 0.25;

/** Steepness of the logistic curve mapping (ability - difficulty) to P(correct). */
const K_SLOPE = 6;

/**
 * Probability that a student of `ability` answers a question of `level`
 * correctly — the one-parameter logistic (Rasch) model, the standard basis for
 * computerised adaptive testing.
 */
export function expectedScore(ability: number, level: Difficulty): number {
	return 1 / (1 + Math.exp(-(ability - DIFFICULTY_VALUE[level]) * K_SLOPE));
}

/**
 * Elo update. The estimate moves by how *surprising* the result was, which
 * gives the behaviour we want for free:
 *   - correct on something above your level  -> large increase
 *   - correct on something easy              -> small increase
 *   - wrong on something hard                -> small decrease ("reduce slightly")
 *   - wrong on something easy                -> large decrease
 */
export function updateAbility(
	ability: number,
	level: Difficulty,
	isCorrect: boolean,
): number {
	const expected = expectedScore(ability, level);
	const next = ability + K_FACTOR * ((isCorrect ? 1 : 0) - expected);
	return Number(Math.max(0, Math.min(1, next)).toFixed(4));
}

/** Replay an attempt's answers into a current ability estimate. */
export function abilityFromHistory(
	history: { level: Difficulty; isCorrect: boolean }[],
): number {
	return history.reduce(
		(ability, h) => updateAbility(ability, h.level, h.isCorrect),
		STARTING_ABILITY,
	);
}

/** The level the engine currently wants to serve. Shares the app-wide thresholds. */
export function targetDifficulty(ability: number): Difficulty {
	return nextDifficulty(ability);
}

export type PoolQuestion = {
	id: string;
	difficulty: Difficulty;
	topicId: string | null;
	orderIndex: number;
};

export type TopicStat = { asked: number; correct: number; wrong: number };

/**
 * Relative pull of each term when ranking candidates. Difficulty fit dominates,
 * so the assessment is primarily an ability search; the topic terms steer
 * *which* topic that search runs on.
 */
const W_FIT = 2.0;
const W_STRUGGLE = 1.0;
const W_UNPROVEN = 0.8;
const W_SATURATION = 0.6;

/** Mastery assumed for a topic the student has no history on — neutral. */
const NEUTRAL_MASTERY = 0.5;

/**
 * Rank one candidate. Higher is better.
 *
 * - fit:        how close this question's level is to the student's ability.
 * - struggle:   this topic has produced wrong answers in *this* attempt, so
 *               chase it (spec: wrong twice on Authentication -> ask more
 *               Authentication).
 * - unproven:   prior mastery from the student's history, so an already-mastered
 *               topic gets asked less.
 * - saturation: a flat penalty per question already asked from this topic, so a
 *               10-question assessment cannot collapse onto one topic.
 */
function scoreCandidate(
	q: PoolQuestion,
	ability: number,
	topicStats: Map<string, TopicStat>,
	priorMastery: Map<string, number>,
): number {
	const fit = 1 - Math.abs(DIFFICULTY_VALUE[q.difficulty] - ability);

	if (!q.topicId) return fit * W_FIT;

	const stat = topicStats.get(q.topicId) ?? { asked: 0, correct: 0, wrong: 0 };
	const struggle = stat.wrong - stat.correct * 0.5;
	const unproven = 1 - (priorMastery.get(q.topicId) ?? NEUTRAL_MASTERY);

	return (
		fit * W_FIT +
		struggle * W_STRUGGLE +
		unproven * W_UNPROVEN -
		stat.asked * W_SATURATION
	);
}

/**
 * Choose the next question from the pool, or null when the pool is exhausted.
 * Ties break on orderIndex so a replay of the same answers always produces the
 * same assessment.
 */
export function selectNextQuestion(params: {
	pool: PoolQuestion[];
	askedIds: Set<string>;
	ability: number;
	topicStats: Map<string, TopicStat>;
	priorMastery: Map<string, number>;
}): PoolQuestion | null {
	const { pool, askedIds, ability, topicStats, priorMastery } = params;

	let best: PoolQuestion | null = null;
	let bestScore = Number.NEGATIVE_INFINITY;

	for (const q of pool) {
		if (askedIds.has(q.id)) continue;
		const score = scoreCandidate(q, ability, topicStats, priorMastery);
		if (
			score > bestScore ||
			(score === bestScore && best != null && q.orderIndex < best.orderIndex)
		) {
			best = q;
			bestScore = score;
		}
	}

	return best;
}

/** Fold a graded answer into the running per-topic tally. */
export function recordTopicResult(
	topicStats: Map<string, TopicStat>,
	topicId: string | null,
	isCorrect: boolean,
): Map<string, TopicStat> {
	if (!topicId) return topicStats;
	const next = new Map(topicStats);
	const stat = next.get(topicId) ?? { asked: 0, correct: 0, wrong: 0 };
	next.set(topicId, {
		asked: stat.asked + 1,
		correct: stat.correct + (isCorrect ? 1 : 0),
		wrong: stat.wrong + (isCorrect ? 0 : 1),
	});
	return next;
}

export type TopicOutcome = {
	topicId: string;
	topicTitle: string;
	correct: number;
	total: number;
	ratio: number;
};

export type MasteryReport = {
	strong: TopicOutcome[];
	weak: TopicOutcome[];
	recommendation: string;
};

/** A topic is "strong" at or above this share of its questions correct. */
const STRONG_RATIO = 0.8;
/** ...and "weak" below this. Between the two it is simply not reported either way. */
const WEAK_RATIO = 0.5;

/**
 * Turn the graded answers into the areas-based report the student actually
 * reads. Derived from what they did — no second AI call, so it cannot fail and
 * cannot invent a strength they did not demonstrate.
 */
export function buildMasteryReport(
	outcomes: { topicId: string | null; topicTitle: string; isCorrect: boolean }[],
): MasteryReport {
	const byTopic = new Map<string, { title: string; correct: number; total: number }>();

	for (const o of outcomes) {
		if (!o.topicId) continue;
		const entry = byTopic.get(o.topicId) ?? { title: o.topicTitle, correct: 0, total: 0 };
		entry.correct += o.isCorrect ? 1 : 0;
		entry.total += 1;
		byTopic.set(o.topicId, entry);
	}

	const all: TopicOutcome[] = [...byTopic.entries()].map(([topicId, e]) => ({
		topicId,
		topicTitle: e.title,
		correct: e.correct,
		total: e.total,
		ratio: e.total === 0 ? 0 : e.correct / e.total,
	}));

	const strong = all
		.filter((t) => t.ratio >= STRONG_RATIO)
		.sort((a, b) => b.ratio - a.ratio);
	const weak = all
		.filter((t) => t.ratio < WEAK_RATIO)
		.sort((a, b) => a.ratio - b.ratio);

	let recommendation: string;
	if (weak.length === 0 && strong.length > 0) {
		recommendation =
			"No weak areas in this assessment — move on to the next topic, or raise the length to be stretched further.";
	} else if (weak.length === 0) {
		recommendation = "Keep practising to build a clearer picture of your strengths.";
	} else if (weak.length === 1) {
		recommendation = `Review ${weak[0]!.topicTitle} before attempting another adaptive assessment.`;
	} else {
		recommendation = `Review ${weak[0]!.topicTitle} and ${weak[1]!.topicTitle} before attempting another adaptive assessment.`;
	}

	return { strong, weak, recommendation };
}
