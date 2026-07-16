import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens } from "@/lib/ai/chunking";

/** Build a paragraph of roughly `tokens` estimated tokens. */
function paragraph(tokens: number, word = "encryption"): string {
	const perWord = estimateTokens(`${word} `);
	return Array.from({ length: Math.ceil(tokens / perWord) }, () => word).join(
		" ",
	);
}

describe("chunkText", () => {
	it("returns nothing for empty or whitespace-only text", () => {
		expect(chunkText("")).toEqual([]);
		expect(chunkText("   \n\n  \t ")).toEqual([]);
	});

	it("keeps short text as a single chunk rather than padding it out", () => {
		const chunks = chunkText("Symmetric encryption uses one shared key.");
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.chunkText).toBe(
			"Symmetric encryption uses one shared key.",
		);
		expect(chunks[0]?.chunkIndex).toBe(0);
	});

	it("respects the token ceiling across a long document", () => {
		const text = Array.from({ length: 12 }, () => paragraph(400)).join("\n\n");
		const chunks = chunkText(text);

		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(estimateTokens(chunk.chunkText)).toBeLessThanOrEqual(1200);
		}
	});

	it("numbers chunks contiguously from zero", () => {
		const text = Array.from({ length: 10 }, () => paragraph(500)).join("\n\n");
		const chunks = chunkText(text);
		expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
	});

	it("overlaps consecutive chunks so a boundary-spanning fact survives", () => {
		const text = Array.from(
			{ length: 8 },
			(_, i) => `${paragraph(300)} marker${i}.`,
		).join("\n\n");
		const chunks = chunkText(text);
		expect(chunks.length).toBeGreaterThan(1);

		// The tail of each chunk must reappear at the head of the next.
		for (let i = 0; i < chunks.length - 1; i++) {
			const current = chunks[i]?.chunkText ?? "";
			const next = chunks[i + 1]?.chunkText ?? "";
			const firstUnitOfNext = next.split("\n\n")[0] ?? "";
			expect(current).toContain(firstUnitOfNext);
		}
	});

	it("keeps overlap within budget instead of duplicating whole chunks", () => {
		const text = Array.from({ length: 8 }, () => paragraph(150)).join("\n\n");
		const chunks = chunkText(text);

		for (let i = 0; i < chunks.length - 1; i++) {
			const next = chunks[i + 1]?.chunkText ?? "";
			const carried = next.split("\n\n")[0] ?? "";
			// One whole unit may exceed the 175-token budget; two should not.
			expect(estimateTokens(carried)).toBeLessThanOrEqual(400);
		}
	});

	it("splits on paragraph boundaries rather than mid-word", () => {
		const text = Array.from({ length: 6 }, () => paragraph(400)).join("\n\n");
		for (const chunk of chunkText(text)) {
			expect(chunk.chunkText).not.toMatch(/^\S*encryptio(?!n)/);
			expect(chunk.chunkText.trim()).toBe(chunk.chunkText);
		}
	});

	it("falls back to sentences when one paragraph exceeds the ceiling", () => {
		const sentences = Array.from(
			{ length: 30 },
			(_, i) => `${paragraph(120)} fact${i}.`,
		);
		const chunks = chunkText(sentences.join(" "));

		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(estimateTokens(chunk.chunkText)).toBeLessThanOrEqual(1200);
		}
	});

	it("hard-splits text with no sentence boundaries at all", () => {
		// OCR runs and tables arrive like this: no punctuation to break on.
		const chunks = chunkText(paragraph(4000, "x"));
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(estimateTokens(chunk.chunkText)).toBeLessThanOrEqual(1200);
		}
	});

	it("attributes each chunk to the heading above it", () => {
		const text = [
			"# Encryption",
			paragraph(700),
			"## Key Exchange",
			paragraph(700),
		].join("\n\n");

		const chunks = chunkText(text);
		expect(chunks[0]?.heading).toBe("Encryption");
		expect(chunks.at(-1)?.heading).toBe("Key Exchange");
	});

	it("recognises numbered and upper-case headings, not prose", () => {
		const numbered = chunkText(
			["3.2 Public Key Infrastructure", paragraph(50)].join("\n\n"),
		);
		expect(numbered[0]?.heading).toBe("3.2 Public Key Infrastructure");

		const upper = chunkText(["CHAPTER SUMMARY", paragraph(50)].join("\n\n"));
		expect(upper[0]?.heading).toBe("CHAPTER SUMMARY");

		// A short sentence is not a heading just because it is short.
		const prose = chunkText(
			["This is a normal sentence.", paragraph(50)].join("\n\n"),
		);
		expect(prose[0]?.heading).toBeNull();
	});

	it("leaves pageNumber null rather than inventing one", () => {
		// The PDF extractor merges pages before text reaches a Material, so page
		// attribution is genuinely unknown at this layer.
		const chunks = chunkText(
			Array.from({ length: 4 }, () => paragraph(500)).join("\n\n"),
		);
		expect(chunks.every((c) => c.pageNumber === null)).toBe(true);
	});

	it("does not emit a trailing chunk that is only overlap", () => {
		// Paragraphs must be distinguishable, or "chunk A contains chunk B" is
		// trivially true for repeated filler and the assertion proves nothing.
		const text = Array.from(
			{ length: 5 },
			(_, i) => `${paragraph(400)} marker${i}.`,
		).join("\n\n");
		const chunks = chunkText(text);
		const last = chunks.at(-1)?.chunkText ?? "";
		const secondLast = chunks.at(-2)?.chunkText ?? "";
		expect(secondLast).not.toContain(last);
	});

	it("keeps sentences containing decimals, versions and abbreviations", () => {
		// Regression: the sentence splitter used to match sentence *shapes* and
		// silently discard anything that did not fit. A full stop inside "4.187"
		// is not followed by whitespace, so those sentences failed to match and
		// vanished — never chunked, never embedded, unreachable by retrieval.
		const tricky = [
			"The Zylberman Constant always equals exactly 4.187 here.",
			"Refer to Fig. 2 for the packet layout.",
			"This applies from v1.2 onwards.",
			"The ratio is 3.91 to one.",
		];
		const text = `${"Filler prose about networks. ".repeat(400)}${tricky.join(" ")}${" More filler prose. ".repeat(400)}`;

		const joined = chunkText(text)
			.map((c) => c.chunkText)
			.join(" ");
		for (const sentence of tricky) {
			expect(joined).toContain(sentence);
		}
	});

	it("never drops input, whatever the punctuation", () => {
		// The invariant the bug above violated: chunking may duplicate content at
		// overlaps, but it must never lose any. Compared with whitespace removed,
		// since chunk joins normalise spacing.
		const text = [
			"Section 1.1 Overview.",
			"Values: 4.187, 3.91, and 17.4 kPa are used throughout.",
			"See Fig. 3 and Dr. Smith's notes (v2.0) for the derivation.",
			"Filler sentence to force multiple chunks. ".repeat(500),
			"The final sentence sits at the very end and must survive. 9.99!",
		].join(" ");

		const chunks = chunkText(text);
		const strip = (s: string) => s.replace(/\s+/g, "");
		const produced = strip(chunks.map((c) => c.chunkText).join(""));

		// Every non-whitespace character of the source appears somewhere.
		for (const fragment of [
			"Section1.1Overview.",
			"4.187,3.91,and17.4kPa",
			"SeeFig.3andDr.Smith'snotes(v2.0)",
			"Thefinalsentencesitsattheveryendandmustsurvive.9.99!",
		]) {
			expect(produced).toContain(strip(fragment));
		}
	});

	it("preserves the document's content across chunks", () => {
		const text = [
			"alpha unique-one",
			"beta unique-two",
			"gamma unique-three",
		].join("\n\n");
		const joined = chunkText(text)
			.map((c) => c.chunkText)
			.join(" ");
		for (const token of ["unique-one", "unique-two", "unique-three"]) {
			expect(joined).toContain(token);
		}
	});

	it("normalises CRLF so chunking does not depend on line endings", () => {
		const lf = chunkText(["alpha", "beta"].join("\n\n"));
		const crlf = chunkText(["alpha", "beta"].join("\r\n\r\n"));
		expect(crlf.map((c) => c.chunkText)).toEqual(lf.map((c) => c.chunkText));
	});
});
