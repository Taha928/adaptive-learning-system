import { embedChunks } from "@/lib/ai/embeddings";
import { logger } from "@/lib/logger";

/**
 * Match AI-written study-plan steps back to the real topics they refer to.
 *
 * The plan prompt asks the model to repeat each topic's title "EXACTLY,
 * character for character", and the linker used to take it at its word: a
 * case-insensitive exact-string lookup. Models do not honour that reliably —
 * they re-punctuate, re-case, expand ("Symmetric Encryption" ->
 * "Introduction to Symmetric Encryption"), or append the summary. Every near
 * miss silently became `topicId: null`, so the step rendered as inert text with
 * nothing to open. On a 50-page PDF whose topics are themselves AI-generated
 * and long, that was 0 of 7 steps linked.
 *
 * So matching is done on meaning rather than on characters, in two passes:
 *
 *   1. Lexical. Free, deterministic, and enough for the overwhelming majority —
 *      wording, punctuation, casing and length differences all wash out under
 *      normalisation and IDF-weighted token overlap.
 *   2. Semantic. Only for steps the lexical pass could not place. This is what
 *      catches genuine synonyms ("Ciphers" / "Encryption"), which no amount of
 *      string comparison can see. It costs one embedding call, so it runs only
 *      on the leftovers, and never at all when there are none.
 *
 * Both passes are gated on confidence: a step with no convincing match stays
 * unlinked. That is a real outcome, not a failure — a plan's final "review
 * everything" step legitimately belongs to no single topic, and inventing a link
 * for it would send the student somewhere arbitrary.
 */

/**
 * Grammatical filler only. Content words ("introduction", "applications",
 * "overview") are deliberately KEPT: a course routinely contains both
 * "Introduction to Symmetric Encryption" and "Applications of Symmetric
 * Encryption", and dropping the distinguishing word would collapse them into
 * the same key and make the match a coin toss.
 */
const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"of",
	"to",
	"and",
	"or",
	"for",
	"in",
	"on",
	"at",
	"by",
	"with",
	"from",
	"into",
	"its",
	"their",
	"this",
	"that",
	"as",
	"is",
	"are",
	"be",
]);

/** Lexical score at or above which a step is confidently a topic's. */
export const LEXICAL_THRESHOLD = 0.5;

/**
 * Cosine similarity required in the semantic pass. Higher than retrieval's
 * floor: retrieval wants passages that might help, whereas this decides where a
 * click will take the student. A wrong link is worse than no link.
 */
export const SEMANTIC_THRESHOLD = 0.8;

/**
 * Strip everything that varies without changing meaning: accents, case,
 * punctuation, and the step numbering models like to prepend ("Step 3:",
 * "Week 2 -", "1.2").
 */
export function normalizeTitle(raw: string): string {
	return raw
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(
			/^\s*(step|week|day|part|module|unit|lesson|phase|topic)\s*\d+\s*[:.)\-–—]*\s*/,
			"",
		)
		.replace(/^\s*\d+(\.\d+)*\s*[:.)\-–—]*\s*/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

/**
 * Crude suffix stripping so "encryption" / "encrypting" / "encrypt" collapse to
 * one key. Not linguistically correct and not meant to be — both sides go
 * through the identical transform, so consistency is the only property that
 * matters, and a real stemmer would be a dependency for no gain here.
 */
function stem(token: string): string {
	if (token.length > 5 && token.endsWith("tion")) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith("ies"))
		return `${token.slice(0, -3)}y`;
	if (token.length > 4 && token.endsWith("ing")) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
		return token.slice(0, -1);
	}
	return token;
}

/** Normalised, stopword-free, stemmed tokens. */
export function titleTokens(raw: string): string[] {
	return normalizeTitle(raw)
		.split(" ")
		.filter((t) => t && !STOPWORDS.has(t))
		.map(stem);
}

/**
 * Inverse document frequency across the topic set.
 *
 * This is what stops a shared word from carrying a match. In a cryptography
 * course nearly every topic says "encryption", so the word says almost nothing
 * about *which* topic is meant; "vandermeer" appearing once says almost
 * everything. Unweighted overlap would happily link a step to the wrong topic on
 * the strength of the common word alone.
 */
export function buildIdf(topicTokenSets: string[][]): Map<string, number> {
	const n = Math.max(1, topicTokenSets.length);
	const df = new Map<string, number>();
	for (const tokens of topicTokenSets) {
		for (const token of new Set(tokens)) {
			df.set(token, (df.get(token) ?? 0) + 1);
		}
	}
	const idf = new Map<string, number>();
	for (const [token, freq] of df) {
		idf.set(token, Math.log((n + 1) / (freq + 0.5)));
	}
	return idf;
}

/** Weight of a token; one never seen in the topic set is maximally specific. */
function weightOf(token: string, idf: Map<string, number>, topicCount: number) {
	return idf.get(token) ?? Math.log((topicCount + 1) / 0.5);
}

/**
 * How strongly a step's title refers to a topic's, in [0, 1].
 *
 * Two views, because they fail in opposite directions:
 *   - Dice rewards the two titles being *the same*, and is what an exact or
 *     near-exact repeat scores highest on.
 *   - Coverage asks only whether the step contains the whole topic. That is the
 *     one that survives the model padding a title out ("Master symmetric
 *     encryption basics before the exam"), where Dice is dragged down by the
 *     extra words even though the reference is unambiguous.
 * Taking the better of the two means neither shape is punished; coverage is
 * shaded slightly so a true repeat still outranks a mention.
 */
export function lexicalScore(
	stepTokens: string[],
	topicTokens: string[],
	idf: Map<string, number>,
	topicCount: number,
): number {
	if (stepTokens.length === 0 || topicTokens.length === 0) return 0;

	const stepSet = new Set(stepTokens);
	const topicSet = new Set(topicTokens);
	const w = (t: string) => weightOf(t, idf, topicCount);

	let shared = 0;
	for (const token of topicSet) {
		if (stepSet.has(token)) shared += w(token);
	}
	if (shared === 0) return 0;

	let stepMass = 0;
	for (const token of stepSet) stepMass += w(token);
	let topicMass = 0;
	for (const token of topicSet) topicMass += w(token);

	const dice = (2 * shared) / (stepMass + topicMass);
	const coverage = shared / topicMass;
	return Math.min(1, Math.max(dice, coverage * 0.92));
}

export type MatchCandidate = { id: string; title: string };

/**
 * Lexically assign steps to topics, one topic per step and one step per topic.
 *
 * Greedy over the globally best pair first. The plan prompt mandates one step
 * per topic, so contention means one of the two steps is wrong; letting the
 * strongest pair claim its topic and forcing the loser to justify itself against
 * what remains beats resolving each step in isolation, where a mediocre match
 * could steal a topic from the step that really owned it.
 */
export function matchStepsLexically(
	steps: string[],
	topics: MatchCandidate[],
	threshold = LEXICAL_THRESHOLD,
): (string | null)[] {
	const result: (string | null)[] = steps.map(() => null);
	if (topics.length === 0) return result;

	const topicTokens = topics.map((t) => titleTokens(t.title));
	const idf = buildIdf(topicTokens);
	const stepTokens = steps.map((s) => titleTokens(s));

	const pairs: { step: number; topic: number; score: number }[] = [];
	for (let s = 0; s < steps.length; s++) {
		for (let t = 0; t < topics.length; t++) {
			const score = lexicalScore(
				stepTokens[s] ?? [],
				topicTokens[t] ?? [],
				idf,
				topics.length,
			);
			if (score >= threshold) pairs.push({ step: s, topic: t, score });
		}
	}
	pairs.sort((a, b) => b.score - a.score);

	const usedSteps = new Set<number>();
	const usedTopics = new Set<number>();
	for (const pair of pairs) {
		if (usedSteps.has(pair.step) || usedTopics.has(pair.topic)) continue;
		usedSteps.add(pair.step);
		usedTopics.add(pair.topic);
		result[pair.step] = topics[pair.topic]?.id ?? null;
	}
	return result;
}

/** Cosine similarity. OpenAI returns unit vectors, so this is their dot product. */
function cosine(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
	return dot;
}

/**
 * Resolve every step to a topic id (or null), lexical first and semantic only
 * for what is left over.
 *
 * Never throws: if embedding fails, the lexical matches still stand. A study
 * plan with most steps linked is worth far more than no study plan at all.
 */
export async function linkStepsToTopics(params: {
	steps: string[];
	topics: MatchCandidate[];
}): Promise<(string | null)[]> {
	const { steps, topics } = params;
	if (steps.length === 0 || topics.length === 0) {
		return steps.map(() => null);
	}

	const linked = matchStepsLexically(steps, topics);

	const unresolved = linked
		.map((id, i) => (id === null ? i : -1))
		.filter((i) => i !== -1);
	const takenTopics = new Set(linked.filter((id): id is string => id !== null));
	const freeTopics = topics.filter((t) => !takenTopics.has(t.id));

	// Nothing left to place, or nothing left to place it in.
	if (unresolved.length === 0 || freeTopics.length === 0) return linked;

	try {
		// One call for both sides: same model, same space, directly comparable.
		const stepTexts = unresolved.map((i) => steps[i] ?? "");
		const vectors = await embedChunks([
			...stepTexts,
			...freeTopics.map((t) => t.title),
		]);
		const stepVectors = vectors.slice(0, stepTexts.length);
		const topicVectors = vectors.slice(stepTexts.length);

		const pairs: { step: number; topic: number; score: number }[] = [];
		for (let s = 0; s < stepVectors.length; s++) {
			for (let t = 0; t < topicVectors.length; t++) {
				const score = cosine(stepVectors[s] ?? [], topicVectors[t] ?? []);
				if (score >= SEMANTIC_THRESHOLD) {
					pairs.push({ step: s, topic: t, score });
				}
			}
		}
		pairs.sort((a, b) => b.score - a.score);

		const usedSteps = new Set<number>();
		const usedTopics = new Set<number>();
		for (const pair of pairs) {
			if (usedSteps.has(pair.step) || usedTopics.has(pair.topic)) continue;
			usedSteps.add(pair.step);
			usedTopics.add(pair.topic);
			const stepIndex = unresolved[pair.step];
			const topic = freeTopics[pair.topic];
			if (stepIndex !== undefined && topic) linked[stepIndex] = topic.id;
		}
	} catch (error) {
		logger.warn(
			{ error, unresolved: unresolved.length },
			"Semantic topic matching failed; keeping lexical links only",
		);
	}

	return linked;
}
