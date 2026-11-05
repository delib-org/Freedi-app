import m from 'mithril';
import type { ClassBallot, ClassTable, LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	actForModeOf,
	actForStudents,
	voteActionState,
	type ActForMode,
	type ActForStudent,
} from '@/lib/classroom/actFor';
import { classCastVoteFor } from '@/lib/classroom/api';
import { listenStudentVote } from '@/lib/classroom/c3Data';
import { readDraft } from '@/lib/classroom/c3Draft';
import { VoteCaster } from '@/lib/classroom/voteCaster';
import type { Unsubscribe } from '@/lib/firebase';

/**
 * Module state of the act-for sheet (the console's store pattern: plain state +
 * m.redraw). The rule that matters: a vote or a proposal must never land on the wrong
 * student. So each student has a slot of their own, bound to their id when it is made:
 * their vote listener, their VoteCaster and their draft. Nothing is shared and nothing
 * is carried over. Moving to another student is always the teacher's tap.
 */

/** What the proposal part of the sheet last said to the teacher about this student. */
export type ProposalNotice = 'sent' | 'saved' | null;

export class StudentSlot {
	readonly studentId: string;
	readonly caster: VoteCaster;
	/** The vote the server holds for this student. */
	votedId: string | null = null;
	/** Whether a card can be voted for right now (kept live by syncActFor, sheet open or not). */
	castable: (optionId: string) => boolean = () => false;
	/** What the listener is bound to; null = no listener. */
	listeningTo: string | null = null;
	stopVote: Unsubscribe | null = null;
	/** The draft of a new proposal for this student (also kept in localStorage until sent). */
	newText: string;
	/** Text edited for an existing proposal; absent = the box shows the proposal as it is. */
	editText: { id: string; text: string } | null = null;
	/** The proposal being edited by choice; null = the box follows the limit. */
	editId: string | null = null;
	/** The id of the proposal being sent; kept for a retry so it is never written twice. */
	proposalId: string | null = null;
	sending = false;
	sendFailed = false;
	limitRefused = false;
	notice: ProposalNotice = null;

	constructor(mainId: string, studentId: string) {
		this.studentId = studentId;
		this.newText = readDraft(draftScopeOf(mainId, studentId), 'proposal');
		this.caster = new VoteCaster({
			// The student's id is fixed here: no later state can point this caster at someone else.
			write: async (optionId) => {
				await classCastVoteFor({ mainId, forStudentId: studentId, optionId });
			},
			onChange: () => m.redraw(),
			canCast: (optionId) => this.castable(optionId),
			onError: (error) =>
				console.error(
					'[ActFor] vote write failed',
					{ operation: 'actFor.castVote', statementId: mainId, metadata: { studentId } },
					error,
				),
		});
	}
}

/** The local draft of a proposal for one student, kept apart from every other student's. */
export function draftScopeOf(mainId: string, studentId: string): string {
	return `${mainId}:actFor:${studentId}`;
}

export interface ActForView {
	open: boolean;
	/** The student the sheet is on; null = the list or the add form only. */
	studentId: string | null;
	addOpen: boolean;
	addName: string;
	addTable: number | null;
	adding: boolean;
	addFailed: boolean;
}

export const actForView: ActForView = {
	open: false,
	studentId: null,
	addOpen: false,
	addName: '',
	addTable: null,
	adding: false,
	addFailed: false,
};

const slots = new Map<string, StudentSlot>();
let slotsFor = '';
let mode: ActForMode = 'none';

function stopListening(slot: StudentSlot): void {
	slot.stopVote?.();
	slot.stopVote = null;
	slot.listeningTo = null;
}

/** The lesson is gone: every listener stops and every slot goes with it. */
export function stopActFor(): void {
	for (const slot of slots.values()) stopListening(slot);
	slots.clear();
	slotsFor = '';
	mode = 'none';
	actForView.open = false;
	actForView.studentId = null;
	actForView.addOpen = false;
	actForView.addName = '';
	actForView.addTable = null;
	actForView.adding = false;
	actForView.addFailed = false;
}

export interface ActForSync {
	mainId: string;
	challengeId: string | null;
	ballot: ClassBallot | undefined;
	held: boolean;
	stepKey: LessonStepKey;
	tables: readonly ClassTable[];
}

/**
 * Called on every draw of the console: one slot per student. At the Vote step each has
 * their own vote listener, so the band's count stays live whether the sheet is open or not.
 */
export function syncActFor({
	mainId,
	challengeId,
	ballot,
	held,
	stepKey,
	tables,
}: ActForSync): void {
	if (slotsFor !== mainId) {
		stopActFor();
		slotsFor = mainId;
	}
	mode = actForModeOf(stepKey);
	const students = actForStudents(tables);
	const ids = new Set(students.map((student) => student.id));
	for (const [id, slot] of slots) {
		if (ids.has(id)) continue;
		stopListening(slot);
		slots.delete(id);
	}
	const open = voteActionState(ballot, held) === 'open';
	const candidates = ballot?.candidateIds ?? [];
	for (const student of students) {
		const slot = slotOf(mainId, student.id);
		slot.castable = (optionId) => open && candidates.includes(optionId);
		const wanted = mode === 'vote' ? challengeId : null;
		if (slot.listeningTo === wanted) continue;
		stopListening(slot);
		if (wanted) listenFor(slot, wanted);
	}
}

function listenFor(slot: StudentSlot, challengeId: string): void {
	slot.listeningTo = challengeId;
	slot.stopVote = listenStudentVote(
		challengeId,
		slot.studentId,
		(optionId) => {
			slot.votedId = optionId;
			slot.caster.sync(optionId);
			m.redraw();
		},
		(error) =>
			console.error(
				'[ActFor] vote listener error',
				{ operation: 'actFor.listenVote', metadata: { studentId: slot.studentId } },
				error,
			),
	);
}

export function slotOf(mainId: string, studentId: string): StudentSlot {
	const existing = slots.get(studentId);
	if (existing) return existing;
	const slot = new StudentSlot(mainId, studentId);
	slots.set(studentId, slot);

	return slot;
}

/** What acting for a student means at the current step. */
export function actForMode(): ActForMode {
	return mode;
}

/** Open the sheet on this student. Only at a step that has something to do for them. */
export function openActFor(studentId: string | null): void {
	if (mode === 'none') return;
	actForView.open = true;
	actForView.studentId = studentId;
}

export function closeActFor(): void {
	actForView.open = false;
	actForView.addOpen = false;
}

/** The band opens the sheet at the first student not done, or on the add form when there is nobody. */
export function openActForFirst(first: ActForStudent | null): void {
	openActFor(first?.id ?? null);
}

/** The row's action in the table sheet, naming the student; null when nothing can be done now. */
export function actForRowLabel(name: string): string | null {
	if (mode === 'proposal') return t('console.propose_for', { name });

	return mode === 'vote' ? t('console.vote_for', { name }) : null;
}
