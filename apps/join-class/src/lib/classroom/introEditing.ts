/**
 * Pure text edits behind the introduction editor's toolbar and keys (UX 14.B).
 * Each takes the textarea's value and selection and returns the new value and
 * selection; the view applies it (through execCommand so Ctrl+Z still works).
 */

export interface EditResult {
	value: string;
	start: number;
	end: number;
}

export type ListKind = 'ul' | 'ol';

const BOLD_MARK = '**';
const BULLET_MARKER = /^(\s*)([-*•])\s+/;
const NUMBER_MARKER = /^(\s*)\d+[.)]\s+/;

export interface KeyLike {
	code: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/** Ctrl/Cmd+B. `code`, not `key`: on a Hebrew layout the B key types "נ". */
export function isBoldShortcut(e: KeyLike): boolean {
	return e.code === 'KeyB' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
}

/** Wrap the selection in ** ... **, or unwrap it when it is already wrapped. No selection: **** with the caret inside. */
export function toggleBold(value: string, start: number, end: number): EditResult {
	const mark = BOLD_MARK.length;
	const before = value.slice(0, start);
	const selected = value.slice(start, end);
	const after = value.slice(end);
	// stars just outside the selection
	if (before.endsWith(BOLD_MARK) && after.startsWith(BOLD_MARK) && start !== end) {
		return {
			value: before.slice(0, -mark) + selected + after.slice(mark),
			start: start - mark,
			end: end - mark,
		};
	}
	// stars inside the selection
	if (
		selected.length >= mark * 2 &&
		selected.startsWith(BOLD_MARK) &&
		selected.endsWith(BOLD_MARK)
	) {
		const inner = selected.slice(mark, -mark);

		return { value: before + inner + after, start, end: start + inner.length };
	}
	if (start === end) {
		return {
			value: before + BOLD_MARK + BOLD_MARK + after,
			start: start + mark,
			end: start + mark,
		};
	}

	return {
		value: before + BOLD_MARK + selected + BOLD_MARK + after,
		start: start + mark,
		end: end + mark,
	};
}

function lineBounds(value: string, start: number, end: number): { from: number; to: number } {
	const from = value.lastIndexOf('\n', start - 1) + 1;
	// a selection that ends right after a newline does not touch the next line
	const lastChar = end > start ? end - 1 : end;
	const nl = value.indexOf('\n', lastChar);

	return { from, to: nl === -1 ? value.length : nl };
}

function markerOf(line: string): ListKind | null {
	if (BULLET_MARKER.test(line)) return 'ul';
	if (NUMBER_MARKER.test(line)) return 'ol';

	return null;
}

function stripMarker(line: string): string {
	return line.replace(BULLET_MARKER, '$1').replace(NUMBER_MARKER, '$1');
}

/**
 * Put a list marker on every non-empty line the selection touches. If all of
 * them already carry this kind of marker, remove the markers; the other kind is
 * replaced.
 */
export function toggleList(value: string, start: number, end: number, kind: ListKind): EditResult {
	const { from, to } = lineBounds(value, start, end);
	const lines = value.slice(from, to).split('\n');
	const filled = lines.filter((line) => line.trim() !== '');
	const remove = filled.length > 0 && filled.every((line) => markerOf(line) === kind);
	let n = 0;
	const next = lines.map((line) => {
		if (line.trim() === '') return line;
		const plain = stripMarker(line);
		if (remove) return plain;
		n += 1;

		return kind === 'ul' ? `- ${plain.trimStart()}` : `${n}. ${plain.trimStart()}`;
	});
	const block = next.join('\n');

	return {
		value: value.slice(0, from) + block + value.slice(to),
		start: from,
		end: from + block.length,
	};
}

/**
 * Enter on a list line: continue the list (- stays -, n. becomes n+1.); on a
 * line that is only its marker, remove the marker and end the list. Null =
 * not a list line, let the textarea insert its newline.
 */
export function continueList(value: string, caret: number): EditResult | null {
	const from = value.lastIndexOf('\n', caret - 1) + 1;
	const nl = value.indexOf('\n', caret);
	const to = nl === -1 ? value.length : nl;
	const line = value.slice(from, to);
	const bullet = /^(\s*)([-*•])\s+(.*)$/.exec(line);
	const numbered = /^(\s*)(\d+)([.)])\s+(.*)$/.exec(line);
	if (!bullet && !numbered) return null;
	// Enter in the middle of the marker itself is a plain newline
	const markerEnd =
		from + (line.length - (bullet ? bullet[3].length : (numbered?.[4].length ?? 0)));
	if (caret < markerEnd) return null;
	const body = bullet ? bullet[3] : (numbered?.[4] ?? '');
	if (body.trim() === '') {
		return { value: value.slice(0, from) + value.slice(to), start: from, end: from };
	}
	const indent = (bullet ?? numbered)?.[1] ?? '';
	const marker = bullet ? `${bullet[2]} ` : `${Number(numbered?.[2]) + 1}${numbered?.[3]} `;
	const insert = `\n${indent}${marker}`;
	const nextValue = value.slice(0, caret) + insert + value.slice(caret);
	const at = caret + insert.length;

	return { value: nextValue, start: at, end: at };
}
