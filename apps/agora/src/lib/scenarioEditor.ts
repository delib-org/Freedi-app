/**
 * The scenario editor's text <-> data rules and the words for a failed save.
 * Pure, so each can be tested without a browser.
 *
 * Arguments, needs, values and dialogue are edited as plain lines of text and
 * stored as lists. The parse drops lines that carry nothing, which is right for
 * what is STORED and wrong for what is TYPED: a box that re-renders from the
 * stored list throws away the new empty line the teacher has just made, and
 * Enter looks dead. The editor therefore keeps the raw text while the box is in
 * use (see components/LineTextArea.ts) and only ever runs these parsers on it.
 */
import type { AgoraDialogueLine, AgoraValue } from '@freedi/shared-types';
import { errorCodeOf } from './scenarioLibrary/publishFeedback';

/** One entry per non-blank line. The line keeps its own spacing: trimming is the saver's job, not the typist's */
export function parseLines(text: string): string[] {
	return text.split('\n').filter((line) => line.trim());
}

export function formatLines(lines: readonly string[] | undefined): string {
	return (lines ?? []).join('\n');
}

/** "label | description", one value per line. An existing value keeps its id by position. */
export function parseValues(
	text: string,
	previous: readonly AgoraValue[],
	characterIndex: number,
): AgoraValue[] {
	return parseLines(text).map((line, position) => {
		const [label, ...rest] = line.split('|');

		return {
			valueId: previous[position]?.valueId ?? `val-${characterIndex}-${position}`,
			label: label.trim(),
			description: rest.join('|').trim(),
		};
	});
}

export function formatValues(values: readonly AgoraValue[]): string {
	return values.map((value) => `${value.label} | ${value.description}`).join('\n');
}

/** "speaker: line", one per line. A line with no colon has no speaker yet, so it waits in the box and is not stored. */
export function parseDialogue(text: string): AgoraDialogueLine[] {
	return text
		.split('\n')
		.filter((line) => line.includes(':'))
		.map((line) => {
			const [speaker, ...rest] = line.split(':');

			return { speaker: speaker.trim(), line: rest.join(':').trim() };
		});
}

export function formatDialogue(lines: readonly AgoraDialogueLine[]): string {
	return lines.map((entry) => `${entry.speaker}: ${entry.line}`).join('\n');
}

/**
 * The words for a save that failed, chosen by the Firestore (or callable) error
 * code. A save that fails for a reason the teacher can act on says so: a lost
 * connection is "try again", a lost session is "sign in", a scenario that is no
 * longer theirs is neither.
 */
export function saveErrorKey(error: unknown): string {
	const code = errorCodeOf(error)?.replace(/^functions\//, '');
	switch (code) {
		case 'permission-denied':
			return 'editor.save_err_denied';
		case 'unauthenticated':
			return 'editor.save_err_signin';
		case 'unavailable':
		case 'deadline-exceeded':
		case 'aborted':
			return 'editor.save_err_network';
		case 'not-found':
			return 'editor.save_err_missing';
		default:
			return 'editor.save_err';
	}
}

const BYTES_PER_MB = 1024 * 1024;

/** The size limit in whole megabytes, for "up to {mb} MB" */
export function megabytes(bytes: number): number {
	return Math.round(bytes / BYTES_PER_MB);
}
