import { LessonStepKey, Role, campOf } from '@freedi/shared-types';
import type { Camp, ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';

/**
 * Pure helpers of the teacher console (no Firebase, no DOM): the step rail,
 * the gate maths, the roster and the table timer line. Docs: UX section 5 + 11,
 * IA section 3 and 11.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const GATE_ROUNDING = 100;

/** Steps at which every table can be sent to the rate step at once (not Table talk: nobody rates there). */
export const ALL_TABLES_RATE_STEPS: readonly LessonStepKey[] = ['proposals'];

export type RailState = 'done' | 'current' | 'upcoming';

export interface RailStep {
	index: number;
	key: LessonStepKey;
	state: RailState;
}

export function railSteps(keys: readonly LessonStepKey[], currentIndex: number): RailStep[] {
	return keys.map((key, index) => ({
		index,
		key,
		state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
	}));
}

export type ForwardControl = { kind: 'next'; nextIndex: number } | { kind: 'end' };

/** The ONE forward control: open the next step, or end the lesson at the last one. */
export function forwardControl(currentIndex: number, stepCount: number): ForwardControl {
	return currentIndex + 1 < stepCount
		? { kind: 'next', nextIndex: currentIndex + 1 }
		: { kind: 'end' };
}

/** "hh:mm:ss" lesson clock text. */
export function formatClock(elapsedMs: number): string {
	const total = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
	const hours = Math.floor(total / SECONDS_PER_HOUR);
	const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	const seconds = total % SECONDS_PER_MINUTE;

	return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "0:42" for the speaker timer. */
export function formatSpeakerTime(ms: number): string {
	const total = Math.ceil(Math.max(0, ms) / MS_PER_SECOND);

	return `${Math.floor(total / SECONDS_PER_MINUTE)}:${String(total % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

/** Plenum is on when the challenge question's roundPhase is 'improve'. */
export function isPlenum(challenge: Statement | null | undefined): boolean {
	return challenge?.statementSettings?.roundPhase === 'improve';
}

export function isBallotFrozen(challenge: Statement | null | undefined): boolean {
	return typeof challenge?.statementSettings?.ballot?.frozenAt === 'number';
}

/** The teacher paused the vote: nobody votes or changes a vote until it resumes. */
export function isBallotPaused(challenge: Statement | null | undefined): boolean {
	return typeof challenge?.statementSettings?.ballot?.pausedAt === 'number';
}

export function isBallotClosed(challenge: Statement | null | undefined): boolean {
	return typeof challenge?.statementSettings?.ballot?.closedAt === 'number';
}

// ---- gate rows -------------------------------------------------------------

export interface GateRow {
	id: string;
	text: string;
	consensus: number;
	passed: boolean;
	/** How far below the gate (0 when passed). */
	gap: number;
	/** Consensus clamped to 0..1 for the bar fill. */
	fill: number;
	/** Gate clamped to 0..1 for the gate line. */
	gateFill: number;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** One row per visible option, highest consensus first. */
export function gateRows(options: readonly Statement[], gate: number): GateRow[] {
	return options
		.filter((o) => o.hide !== true)
		.map((o) => {
			const consensus = typeof o.consensus === 'number' ? o.consensus : 0;
			const passed = consensus >= gate;

			return {
				id: o.statementId,
				text: o.statement,
				consensus,
				passed,
				gap: passed ? 0 : Math.round((gate - consensus) * GATE_ROUNDING) / GATE_ROUNDING,
				fill: clamp01(consensus),
				gateFill: clamp01(gate),
			};
		})
		.sort((a, b) => b.consensus - a.consensus || a.id.localeCompare(b.id));
}

// ---- roster ----------------------------------------------------------------

export interface RosterStudent {
	uid: string;
	name: string;
	camp: Camp | null;
	tableId: string | null;
}

const SHORT_UID_LENGTH = 4;

/** Joined students (the teacher and other admins are not students). */
export function rosterStudents(roster: readonly StatementSubscription[]): RosterStudent[] {
	return roster
		.filter((sub) => sub.role !== Role.admin && sub.role !== Role.creator)
		.map((sub) => ({
			uid: sub.userId,
			name: sub.user?.displayName?.trim() || sub.userId.slice(0, SHORT_UID_LENGTH),
			camp: sub.camp ?? (typeof sub.side === 'number' ? campOf(sub.side) : null),
			tableId: sub.tableId ?? null,
		}))
		.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
}

/** Students who sit at none of the existing tables. */
export function unplacedStudents(
	students: readonly RosterStudent[],
	tables: readonly ClassTable[],
): RosterStudent[] {
	const seated = new Set(tables.flatMap((tb) => tb.memberUids));

	return students.filter((s) => !seated.has(s.uid));
}

export const CAMP_MARK: Record<Camp, string> = { a: '●', b: '■', center: '◆' };

// ---- table timer line ------------------------------------------------------

export type TimerLine =
	| { kind: 'none' }
	| { kind: 'running'; ms: number; fraction: number; speakerUid: string }
	| { kind: 'over'; speakerUid: string };

/** The card's timer line from the table doc and the remaining ms (null = no clock). */
export function timerLine(table: ClassTable, remaining: number | null, totalMs: number): TimerLine {
	if (table.step !== 'talk' || !table.speakerUid || remaining === null) return { kind: 'none' };
	if (remaining <= 0) return { kind: 'over', speakerUid: table.speakerUid };

	return {
		kind: 'running',
		ms: remaining,
		fraction: clamp01(remaining / totalMs),
		speakerUid: table.speakerUid,
	};
}

/** i18n key of the table's "now" line. */
export function tableStepKey(table: ClassTable, plenum: boolean): string {
	return plenum ? 'console.now_plenum' : `console.now_${table.step}`;
}
