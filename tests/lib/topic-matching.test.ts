import { describe, expect, it } from "vitest";
import {
	buildIdf,
	lexicalScore,
	matchStepsLexically,
	normalizeTitle,
	titleTokens,
} from "@/lib/ai/topic-matching";

/**
 * The topic set is deliberately adversarial: several titles share "encryption"
 * and "cryptography", and two differ only by their leading content word. If the
 * matcher leans on common words it will link the wrong one, and these tests say
 * so.
 */
const TOPICS = [
	{ id: "t1", title: "Foundations of Network Security" },
	{ id: "t2", title: "Introduction to Symmetric Encryption" },
	{ id: "t3", title: "Applications of Symmetric Encryption" },
	{ id: "t4", title: "Asymmetric Cryptography" },
	{ id: "t5", title: "Hashing and Integrity" },
	{ id: "t6", title: "Incident Response" },
];

describe("normalizeTitle", () => {
	it("strips case, punctuation and accents", () => {
		expect(normalizeTitle("Hashing & Integrity!")).toBe("hashing integrity");
		expect(normalizeTitle("  Café —  Naïve Ciphers  ")).toBe(
			"cafe naive ciphers",
		);
	});

	it("strips the step numbering models like to prepend", () => {
		expect(normalizeTitle("Step 3: Asymmetric Cryptography")).toBe(
			"asymmetric cryptography",
		);
		expect(normalizeTitle("Week 2 - Incident Response")).toBe(
			"incident response",
		);
		expect(normalizeTitle("1.2 Hashing and Integrity")).toBe(
			"hashing and integrity",
		);
	});
});

describe("titleTokens", () => {
	it("drops grammatical filler but keeps distinguishing content words", () => {
		// "introduction" and "applications" are the ONLY thing separating t2 from
		// t3; dropping them as noise would make the two indistinguishable. They
		// survive stemming as "introduct" / "application" — the exact form does not
		// matter, only that both sides reduce the same way and the words remain.
		const intro = titleTokens("Introduction to Symmetric Encryption");
		const apps = titleTokens("Applications of Symmetric Encryption");
		expect(intro).toEqual(
			titleTokens("INTRODUCTION, to symmetric encryption!"),
		);
		expect(intro).not.toEqual(apps);
		expect(intro).not.toContain("to");
	});

	it("collapses inflections so wording differences do not matter", () => {
		expect(titleTokens("Encrypting")[0]).toBe(titleTokens("Encrypt")[0]);
		expect(titleTokens("Ciphers")[0]).toBe(titleTokens("Cipher")[0]);
	});
});

describe("lexicalScore", () => {
	it("weights a rare word far above one every topic shares", () => {
		const sets = TOPICS.map((t) => titleTokens(t.title));
		const idf = buildIdf(sets);
		// Keys are stemmed: "encryption" -> "encrypt". It appears in two topics,
		// "incident" in one, so "incident" must identify a topic more strongly.
		const shared = idf.get("encrypt");
		const rare = idf.get("incident");
		expect(shared).toBeDefined();
		expect(rare).toBeDefined();
		expect(shared ?? 0).toBeLessThan(rare ?? 0);
	});

	it("does not link on a shared word alone", () => {
		const sets = TOPICS.map((t) => titleTokens(t.title));
		const idf = buildIdf(sets);
		// A step that says only "encryption" matches no ONE topic — the word is
		// shared, so it cannot identify which.
		const score = lexicalScore(
			titleTokens("Encryption"),
			titleTokens("Introduction to Symmetric Encryption"),
			idf,
			TOPICS.length,
		);
		expect(score).toBeLessThan(0.5);
	});
});

describe("matchStepsLexically", () => {
	const link = (steps: string[]) => matchStepsLexically(steps, TOPICS);

	it("links an exact title", () => {
		expect(link(["Asymmetric Cryptography"])).toEqual(["t4"]);
	});

	it("tolerates capitalization and punctuation", () => {
		expect(link(["ASYMMETRIC CRYPTOGRAPHY!!"])).toEqual(["t4"]);
		expect(link(["hashing & integrity"])).toEqual(["t5"]);
	});

	it("tolerates AI wording and longer titles", () => {
		expect(
			link([
				"Step 1: Master the Foundations of Network Security before moving on",
			]),
		).toEqual(["t1"]);
		// The failure seen live: the model echoing "Title: summary" as the title.
		expect(
			link(["Incident Response: Incident Response covers its core ideas."]),
		).toEqual(["t6"]);
	});

	it("keeps near-identical topics apart", () => {
		// The hard case: these two differ by one word.
		expect(
			link([
				"Introduction to Symmetric Encryption",
				"Applications of Symmetric Encryption",
			]),
		).toEqual(["t2", "t3"]);
	});

	it("links a whole plan, one step per topic", () => {
		const steps = [
			"Step 1: Foundations of Network Security",
			"Step 2: Introduction to Symmetric Encryption",
			"Step 3: Applications of Symmetric Encryption",
			"Step 4: Asymmetric Cryptography",
			"Step 5: Hashing and Integrity",
			"Step 6: Incident Response",
			"Step 7: Final review of everything covered",
		];
		const linked = link(steps);
		expect(linked.slice(0, 6)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
		// The review step belongs to no single topic; inventing a link for it
		// would send the student somewhere arbitrary.
		expect(linked[6]).toBeNull();
	});

	it("never assigns one topic to two steps", () => {
		const linked = link([
			"Asymmetric Cryptography",
			"Asymmetric Cryptography again",
		]);
		const used = linked.filter(Boolean);
		expect(new Set(used).size).toBe(used.length);
	});

	it("leaves an unrelated step unlinked rather than guessing", () => {
		expect(link(["Book the exam and buy a notebook"])).toEqual([null]);
	});

	it("handles no topics without throwing", () => {
		expect(matchStepsLexically(["anything"], [])).toEqual([null]);
	});
});
