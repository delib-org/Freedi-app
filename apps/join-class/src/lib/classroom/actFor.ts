import type { ClassBallot, ClassTable, LessonStepKey, Statement } from '@freedi/shared-types';

/**
 * Pure rules of acting for a student without a device: who they are, what can be
 * done for them at this step and who is done. No Firebase, no DOM.
 */

export interface ActForStudent {
	id: string;
	name: string;
	/** The table's number, always shown beside the name. */
	n: number;
}

export type ActForMode = 'none' | 'proposal' | 'vote';

/** What acting for a student means at this step. Elsewhere there is nothing to do for them. */
export function actForModeOf(stepKey: LessonStepKey): ActForMode {
	if (stepKey === 'proposals' || stepKey === 'allProposals') return 'proposal';

	return stepKey === 'vote' ? 'vote' : 'none';
}

/** Every student without a device, by table, in seating order. */
export function actForStudents(tables: readonly ClassTable[]): ActForStudent[] {
	return [...tables]
		.sort((x, y) => x.n - y.n)
		.flatMap((table) =>
			(table.noDeviceMembers ?? []).map((member) => ({
				id: member.id,
				name: member.name,
				n: table.n,
			})),
		);
}

/** Students without a device at these tables. */
export function noDeviceTotal(tables: readonly Pick<ClassTable, 'noDeviceMembers'>[]): number {
	return tables.reduce((sum, table) => sum + (table.noDeviceMembers ?? []).length, 0);
}

/** Names of the students without a device, by id: the one place a teacher's screen gets them. */
export function noDeviceNamesById(tables: readonly ClassTable[]): Map<string, string> {
	return new Map(actForStudents(tables).map((student) => [student.id, student.name]));
}

export function firstNotDone(
	students: readonly ActForStudent[],
	isDone: (id: string) => boolean,
): ActForStudent | null {
	return students.find((student) => !isDone(student.id)) ?? students[0] ?? null;
}

/** The student after this one, round the list; null when there is nobody else. */
export function nextStudentOf(
	students: readonly ActForStudent[],
	currentId: string,
): ActForStudent | null {
	if (students.length < 2) return null;
	const at = students.findIndex((student) => student.id === currentId);
	if (at < 0) return null;

	return students[(at + 1) % students.length];
}

export type VoteActionState = 'not-open' | 'open' | 'paused' | 'closed' | 'held';

/** Whether a vote can be cast for a student now. Anything but 'open' leaves the sheet read-only. */
export function voteActionState(
	ballot: Pick<ClassBallot, 'closedAt' | 'pausedAt'> | null | undefined,
	held: boolean,
): VoteActionState {
	if (!ballot) return 'not-open';
	if (typeof ballot.closedAt === 'number') return 'closed';
	if (held) return 'held';

	return typeof ballot.pausedAt === 'number' ? 'paused' : 'open';
}

export type ProposalActionState = 'open' | 'frozen' | 'held';

/** Whether a proposal can be sent or changed for a student now: until the ballot freezes. */
export function proposalActionState(ballot: unknown, held: boolean): ProposalActionState {
	if (ballot !== undefined && ballot !== null) return 'frozen';

	return held ? 'held' : 'open';
}

/** Has this student's part of the step been done? A proposal for them, or their vote. */
export function isStudentDone(
	mode: ActForMode,
	studentId: string,
	proposals: readonly Statement[],
	votedId: string | null,
): boolean {
	if (mode === 'vote') return votedId !== null;

	return proposals.some((proposal) => proposal.creatorId === studentId);
}
