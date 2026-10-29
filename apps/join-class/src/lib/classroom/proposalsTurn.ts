import {
	proposalsDone,
	proposalsMaxTurns,
	proposalsTurnOf,
	proposalsTurnOver,
	speakerTimeOver,
	spokeThisTurn,
} from '@freedi/shared-types';
import type { ClassTable, LessonSettingsHolder } from '@freedi/shared-types';

/**
 * The Proposals "talking" screen as one phone reads it (IA 25.6), pure: no
 * Firebase, no DOM. Each tablemate speaks once per turn; when everyone has
 * spoken the next turn opens with the next tap (while a turn is left), else the
 * table is done and waits for the teacher.
 */

export type ProposalsTalkKind = 'done' | 'mine' | 'speaking' | 'spoke' | 'may';

export interface ProposalsTalkState {
	kind: ProposalsTalkKind;
	/** The turn the screen names: the next one once this turn is over and another is left. */
	turn: number;
	max: number;
}

/** First match wins: done, I speak, someone speaks, I already spoke this turn, I may speak. */
export function proposalsTalkState(
	table: ClassTable,
	uid: string,
	main: LessonSettingsHolder | null | undefined,
	now: number,
): ProposalsTalkState {
	const max = proposalsMaxTurns(table, main);
	const current = proposalsTurnOf(table);
	if (proposalsDone(table, main, now)) return { kind: 'done', turn: current, max };
	if (!speakerTimeOver(table, now)) {
		return { kind: table.speakerUid === uid ? 'mine' : 'speaking', turn: current, max };
	}
	// Everyone spoke and a turn is left: the next tap opens it, so the screen already names it.
	if (proposalsTurnOver(table, now)) return { kind: 'may', turn: current + 1, max };
	if (spokeThisTurn(table, uid, now)) return { kind: 'spoke', turn: current, max };

	return { kind: 'may', turn: current, max };
}

/**
 * The "We are done, write" button of the Proposals talk screen. It sits where a
 * speaker looks for "I'm done", so it is hidden while that student holds the
 * floor: ending their minute must never also take them to writing (Trello FgqfUtG2).
 */
export function showsWriteButton(kind: ProposalsTalkKind): boolean {
	return kind !== 'mine';
}
