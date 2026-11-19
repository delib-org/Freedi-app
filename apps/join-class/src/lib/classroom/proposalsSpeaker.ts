import type { ClassTable } from '@freedi/shared-types';

/**
 * Who holds the floor at a table in the Proposals talk step, as the teacher's
 * card reads it. Pure: no Firebase, no DOM. `now` is the server clock in ms.
 * It only reads `speakerUid` / `speakerEndsAt`; the turn logic is proposalsTurn.ts.
 */

export type ProposalsSpeaker =
	| { kind: 'speaking'; uid: string; msLeft: number }
	| { kind: 'nobody' };

/** null outside the talk step: a table that writes or rates has no floor to show. */
export function proposalsSpeakerOf(
	table: Pick<ClassTable, 'step' | 'speakerUid' | 'speakerEndsAt'>,
	now: number,
): ProposalsSpeaker | null {
	if (table.step !== 'talk') return null;
	const { speakerUid, speakerEndsAt } = table;
	if (!speakerUid || speakerEndsAt === undefined || speakerEndsAt <= now) return { kind: 'nobody' };

	return { kind: 'speaking', uid: speakerUid, msLeft: speakerEndsAt - now };
}
