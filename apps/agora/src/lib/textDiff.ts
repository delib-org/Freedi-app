/**
 * Word-level diff for the "what changed" line in a conversation.
 *
 * Wikipedia's grammar, not a code diff: students compare SENTENCES, so the
 * unit is a word (with its trailing space) rather than a character or a
 * line. Character diffs on Hebrew produced unreadable confetti — half a
 * word struck through inside another word.
 *
 * Plain LCS. The texts are one classroom proposal long (a few hundred
 * words at most), so the O(n·m) table is measured in kilobytes and the
 * cost never leaves the noise floor.
 */

export type DiffOp = 'same' | 'added' | 'removed';

export interface DiffPart {
	op: DiffOp;
	text: string;
}

interface Token {
	/** The bare word — what two texts are compared on */
	word: string;
	/** The word WITH its trailing whitespace — what gets rendered back */
	raw: string;
}

/**
 * Split into words, keeping the whitespace attached to each so a rebuild is
 * lossless — but comparing on the bare word. The distinction matters: the
 * last word of a sentence has no trailing space, so comparing raw tokens
 * struck through the old final word every time someone appended a clause.
 */
function toTokens(text: string): Token[] {
	return (text.match(/\S+\s*/g) ?? []).map((raw) => ({ word: raw.trimEnd(), raw }));
}

/**
 * The parts of `next` as they differ from `previous`, in reading order:
 * untouched runs, removals (struck through) and additions (highlighted).
 * Consecutive parts of the same kind are merged, so the renderer gets one
 * span per run rather than one per word.
 */
export function diffWords(previous: string, next: string): DiffPart[] {
	const a = toTokens(previous);
	const b = toTokens(next);

	// lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…]
	const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i][j] =
				a[i].word === b[j].word ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const parts: DiffPart[] = [];
	const push = (op: DiffOp, text: string): void => {
		const last = parts[parts.length - 1];
		if (last && last.op === op) {
			last.text += text;
		} else {
			parts.push({ op, text });
		}
	};

	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i].word === b[j].word) {
			// The surviving word keeps the NEW spacing: the diff reads as the
			// text as it stands now, with the old wording shown alongside
			push('same', b[j].raw);
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			push('removed', a[i].raw);
			i++;
		} else {
			push('added', b[j].raw);
			j++;
		}
	}
	while (i < a.length) push('removed', a[i++].raw);
	while (j < b.length) push('added', b[j++].raw);

	return parts;
}

/** Did anything actually change? (whitespace-only edits do not count) */
export function hasRealChange(previous: string, next: string): boolean {
	return previous.trim() !== next.trim();
}
