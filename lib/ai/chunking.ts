/**
 * Splits extracted material text into overlapping, embeddable chunks.
 *
 * Pure and I/O-free so the segmentation rules are unit-testable on their own —
 * the same reason lib/ai/adaptive.ts keeps its selection maths separate from the
 * router that calls it.
 *
 * "Semantic" here means the splitter respects the document's own boundaries
 * rather than cutting every N characters: it packs whole paragraphs, falls back
 * to whole sentences for paragraphs too big to fit, and only ever splits
 * mid-sentence for text that has no sentence breaks at all (tables, code, OCR
 * runs). A chunk that ends mid-clause embeds badly, which shows up later as a
 * retrieval result that stops halfway through the answer.
 */

/** Target chunk size. Kept inside the 800–1200 token band. */
const TARGET_TOKENS = 1000;
/** Hard ceiling — a chunk is closed rather than exceed this. */
const MAX_TOKENS = 1200;
/** Overlap carried from the end of one chunk into the start of the next. */
const OVERLAP_TOKENS = 175;
/**
 * Below this, a trailing chunk is merged back into its predecessor instead of
 * standing alone. A 20-token chunk is almost pure noise in a similarity search:
 * it is short enough to score highly on incidental word overlap while carrying
 * no real context.
 */
const MIN_TOKENS = 100;

/**
 * Token estimate without a tokenizer dependency.
 *
 * ~4 characters per token is the well-known rule of thumb for English prose
 * through OpenAI's BPE. It is an approximation, which is exactly why the
 * budgets above sit mid-band (1000 target, 1200 ceiling) rather than at the
 * edge: even a 25% under-estimate lands inside the model's 8191-token input
 * limit, so being wrong here costs a slightly-off chunk size, never a failed
 * embedding call.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export type TextChunk = {
	chunkIndex: number;
	chunkText: string;
	heading: string | null;
	pageNumber: number | null;
};

/**
 * A heading looks like: a markdown ATX heading, a numbered section ("3.2
 * Encryption"), or a short standalone line in title/upper case. Deliberately
 * conservative — a false positive mislabels a chunk, which is worse than a
 * chunk with no heading at all.
 */
function headingOf(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed || trimmed.length > 80) return null;

	const atx = /^#{1,6}\s+(.+)$/.exec(trimmed);
	if (atx?.[1]) return atx[1].trim();

	// Prose sentences end in punctuation; headings don't.
	if (/[.!?,;:]$/.test(trimmed)) return null;

	if (/^\d+(\.\d+)*\.?\s+\S/.test(trimmed)) return trimmed;

	const letters = trimmed.replace(/[^a-z]/gi, "");
	if (letters.length >= 3 && letters === letters.toUpperCase()) return trimmed;

	return null;
}

/**
 * Split a paragraph into sentences, keeping their terminating punctuation.
 *
 * Lossless by construction: it walks boundaries and slices between them, so
 * every character of the input ends up in exactly one piece. That property is
 * the whole point. The previous implementation matched sentence *shapes* with
 * `/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g` and silently dropped anything that failed to
 * match — which included every sentence containing a decimal ("4.187"), a
 * version ("v1.2") or an abbreviation ("Fig. 2"), because the inner full stop
 * is not followed by whitespace and the match could not complete. Those
 * sentences never reached a chunk, never got embedded, and were invisible to
 * retrieval: silent data loss, in exactly the numeric passages a student is
 * most likely to ask about.
 *
 * A sentence boundary is terminal punctuation followed by whitespace and then
 * something that can start a sentence — not a digit or a lowercase letter. That
 * second condition keeps "Refer to Fig. 2" and "See No. 5" whole, since a real
 * sentence does not begin mid-enumeration. It is a heuristic, not a parser:
 * "Dr. Smith" still splits. That is tolerable precisely because this is
 * lossless — a misplaced boundary moves text between chunks, it never deletes
 * it, and a chunk holds many sentences either way.
 */
function toSentences(paragraph: string): string[] {
	const out: string[] = [];
	const boundary = /[.!?]+(?=\s+(?![a-z0-9])|\s*$)/g;
	let start = 0;

	let match = boundary.exec(paragraph);
	while (match !== null) {
		const end = match.index + match[0].length;
		const piece = paragraph.slice(start, end).trim();
		if (piece) out.push(piece);
		start = end;
		match = boundary.exec(paragraph);
	}

	// Trailing text after the last boundary (or a paragraph with none at all).
	const rest = paragraph.slice(start).trim();
	if (rest) out.push(rest);

	return out.length > 0 ? out : [paragraph];
}

/** Hard-split text that has no sentence boundaries to break on. */
function splitOversized(text: string, maxTokens: number): string[] {
	const limit = maxTokens * 4;
	const out: string[] = [];
	for (let i = 0; i < text.length; i += limit) {
		out.push(text.slice(i, i + limit));
	}
	return out;
}

/** Take the trailing ~`tokens` worth of a unit, starting at a word boundary. */
function tailOf(unit: string, tokens: number): string {
	const slice = unit.slice(-tokens * 4);
	const boundary = slice.search(/\s/);
	return (boundary > 0 ? slice.slice(boundary) : slice).trim();
}

/**
 * Take whole trailing units from a finished chunk to prepend to the next one,
 * so a fact spanning a boundary survives in at least one chunk intact. Walks
 * backwards and stops before exceeding the overlap budget.
 *
 * The budget is a hard limit, never "at least one whole unit": a single unit can
 * be as large as a whole chunk, and carrying it intact would both duplicate that
 * chunk and push the next one past the ceiling. An oversized trailing unit is
 * therefore carried as its tail only.
 */
function overlapFrom(units: string[], overlapTokens: number): string[] {
	const carried: string[] = [];
	let tokens = 0;
	for (let i = units.length - 1; i >= 0; i--) {
		const unit = units[i];
		if (!unit) continue;
		const cost = estimateTokens(unit);
		if (tokens + cost > overlapTokens) {
			// Nothing carried yet and this unit alone busts the budget: keep its
			// tail so the boundary still overlaps, bounded to the budget.
			if (carried.length === 0) {
				const tail = tailOf(unit, overlapTokens);
				if (tail) carried.unshift(tail);
			}
			break;
		}
		carried.unshift(unit);
		tokens += cost;
	}
	return carried;
}

export type ChunkOptions = {
	targetTokens?: number;
	maxTokens?: number;
	overlapTokens?: number;
	minTokens?: number;
};

/**
 * Split extracted text into overlapping chunks of roughly `targetTokens`.
 *
 * `pageNumber` is always null: the PDF extractor merges pages into one string
 * before the text ever reaches a Material, so page attribution genuinely isn't
 * knowable here. The column exists so that a future per-page extractor can fill
 * it without a migration — better a nullable column than a fabricated number.
 */
export function chunkText(
	text: string,
	options: ChunkOptions = {},
): TextChunk[] {
	const targetTokens = options.targetTokens ?? TARGET_TOKENS;
	const maxTokens = options.maxTokens ?? MAX_TOKENS;
	const overlapTokens = options.overlapTokens ?? OVERLAP_TOKENS;
	const minTokens = options.minTokens ?? MIN_TOKENS;

	// Normalise line endings and collapse runs of blank lines, so paragraph
	// detection doesn't depend on how the source encoded them.
	const normalised = text
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	if (!normalised) return [];

	const chunks: TextChunk[] = [];
	// Units already committed to the open chunk, kept apart so overlap can be
	// computed from whole sentences/paragraphs rather than a sliced string.
	let buffer: string[] = [];
	let bufferTokens = 0;
	let bufferHeading: string | null = null;
	let currentHeading: string | null = null;
	// Units pushed since the last flush. A buffer holding only carried-over
	// overlap has nothing new to emit, and flushing it would duplicate the chunk
	// that overlap came from.
	let freshUnits = 0;

	const flush = () => {
		const body = buffer.join("\n\n").trim();
		if (!body || freshUnits === 0) return;
		chunks.push({
			chunkIndex: chunks.length,
			chunkText: body,
			heading: bufferHeading,
			pageNumber: null,
		});
		buffer = overlapFrom(buffer, overlapTokens);
		bufferTokens = buffer.reduce((sum, u) => sum + estimateTokens(u), 0);
		bufferHeading = currentHeading;
		freshUnits = 0;
	};

	const push = (unit: string) => {
		const cost = estimateTokens(unit);
		if (bufferTokens > 0 && bufferTokens + cost > maxTokens) flush();
		// Overlap alone must not crowd out the unit it exists to precede.
		if (bufferTokens + cost > maxTokens && freshUnits === 0) {
			buffer = [];
			bufferTokens = 0;
		}
		if (buffer.length === 0) bufferHeading = currentHeading;
		buffer.push(unit);
		bufferTokens += cost;
		freshUnits++;
		if (bufferTokens >= targetTokens) flush();
	};

	for (const paragraph of normalised.split(/\n{2,}/)) {
		const block = paragraph.trim();
		if (!block) continue;

		// A heading owns the chunk that follows it, not the one before it.
		const asHeading = block.includes("\n") ? null : headingOf(block);
		if (asHeading) {
			currentHeading = asHeading;
			if (buffer.length === 0) bufferHeading = asHeading;
			push(block);
			continue;
		}

		if (estimateTokens(block) <= maxTokens) {
			push(block);
			continue;
		}

		// Too big to fit whole — fall back to sentences, then to hard slices.
		for (const sentence of toSentences(block)) {
			if (estimateTokens(sentence) <= maxTokens) {
				push(sentence);
				continue;
			}
			for (const slice of splitOversized(sentence, maxTokens)) push(slice);
		}
	}

	// Whatever's left is either a real final chunk or pure overlap already
	// present in the previous one. `buffer` is seeded with overlap after every
	// flush, so a tail with no fresh units carries nothing new — dropping it
	// avoids a duplicate chunk at the end of every document.
	const tail = buffer.join("\n\n").trim();
	if (tail && freshUnits > 0) {
		const last = chunks.at(-1);
		if (estimateTokens(tail) < minTokens && last) {
			// Too small to stand alone: fold it back into its predecessor,
			// dropping the overlap the two already share.
			const fresh = buffer.slice(-freshUnits).join("\n\n").trim();
			last.chunkText = `${last.chunkText}\n\n${fresh}`;
		} else {
			chunks.push({
				chunkIndex: chunks.length,
				chunkText: tail,
				heading: bufferHeading,
				pageNumber: null,
			});
		}
	}

	return chunks;
}
