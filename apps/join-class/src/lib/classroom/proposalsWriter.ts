import type { ClassTable } from '@freedi/shared-types';

/**
 * Who holds the pen at a table in the Proposals write step, and how many have
 * sent or passed, as the teacher's card reads it (IA join-class-proposals-flow
 * §6). Pure: no Firebase, no DOM. It only reads `writerUid`, `writtenUids` and
 * `memberUids`; the rules of the pen are the server's (functions/classroom).
 */

export interface ProposalsWriter {
	/** The pen holder, or null when the pen is free. */
	uid: string | null;
	/** Tablemates with a phone who sent or passed. */
	sent: number;
	/** Tablemates with a phone. */
	total: number;
}

/** null outside the write step: a table that talks or rates has no pen to show. */
export function proposalsWriterOf(
	table: Pick<ClassTable, 'step' | 'writerUid' | 'writtenUids' | 'memberUids'>,
): ProposalsWriter | null {
	if (table.step !== 'write') return null;
	const written = new Set(table.writtenUids ?? []);

	return {
		uid: table.writerUid ?? null,
		sent: table.memberUids.filter((uid) => written.has(uid)).length,
		total: table.memberUids.length,
	};
}
