/**
 * What is new for me on a note — the number the village's card chips and the
 * board door's badge both show.
 *
 * The village answers "did anyone write to me?" with one count per card: on
 * MY note, every classmate's conversation; on a classmate's note, only the
 * conversation I started there. Both sides read the same seen-state watermark
 * the conversation page advances, so opening the conversation is what clears
 * the chip — not glancing at the board.
 *
 * Unlike the flat view's counters, an improvement IDEA counts here as well as
 * chat. The flat workbench shows "open ideas" beside its unread count, so an
 * idea must not be scored twice there; the village card shows nothing else,
 * and an unread idea with no chip is a message nobody hears.
 *
 * Pure — the readers are injected, so a test hands in a map and a watermark.
 */
import { AgoraMessageKind, createAgoraThreadKey } from '@freedi/shared-types';
import type { AgoraProposal } from '../proposals';

export interface NoteNewsSource {
	/** Every conversation on a note, keyed by the helper who started it */
	threads: (noteId: string) => Map<string, AgoraProposal[]>;
	/** One conversation: the note's, with that helper */
	messages: (noteId: string, helperUid: string) => AgoraProposal[];
	/** Lines others wrote past my read mark for that conversation */
	unread: (threadKey: string, messages: AgoraProposal[], myUid: string) => number;
}

/** A line a person wrote — not the system's "the note changed" / "points landed" notices */
function isSpoken(message: AgoraProposal): boolean {
	return (
		message.agoraMessageKind !== AgoraMessageKind.edit &&
		message.agoraMessageKind !== AgoraMessageKind.award
	);
}

/**
 * Unread lines in ONE conversation on a note. A caller already holding the
 * conversation (the owner's rows come from `threads`) passes it in; otherwise
 * it is read from the source.
 */
export function threadNews(
	source: NoteNewsSource,
	noteId: string,
	helperUid: string,
	myUid: string,
	messages: AgoraProposal[] = source.messages(noteId, helperUid),
): number {
	return source.unread(createAgoraThreadKey(noteId, helperUid), messages.filter(isSpoken), myUid);
}

/**
 * Unread lines on a card: my note gathers every helper's conversation; a
 * classmate's note only the one I started with them.
 */
export function noteNews(
	source: NoteNewsSource,
	note: Pick<AgoraProposal, 'statementId' | 'creatorId'>,
	myUid: string,
): number {
	if (note.creatorId !== myUid) return threadNews(source, note.statementId, myUid, myUid);
	let total = 0;
	for (const [helperUid, messages] of source.threads(note.statementId)) {
		total += threadNews(source, note.statementId, helperUid, myUid, messages);
	}

	return total;
}

/** Everything new behind the board door — the sum over the notes it shows */
export function boardNews(
	source: NoteNewsSource,
	notes: ReadonlyArray<Pick<AgoraProposal, 'statementId' | 'creatorId'>>,
	myUid: string,
): number {
	return notes.reduce((sum, note) => sum + noteNews(source, note, myUid), 0);
}
