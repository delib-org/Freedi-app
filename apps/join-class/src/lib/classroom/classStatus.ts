import type { ClassTable, LessonStatus, LessonStepKey } from '@freedi/shared-types';

/**
 * "What the class is doing", as pure data (design 4): the ONE line the teacher reads at each
 * step, and whether it means "you can move on". No i18n here: the line is a key plus params,
 * so the rules are testable and the view only draws. Stuck tables ride along as an attention
 * item (never colour alone: the view adds the clock glyph and words).
 */

/**
 * Proposals: a table counts toward "ready to move on" only when it is really at the rating
 * part. Everyone having spoken, or the pen being taken, is the table still working: it has
 * nothing to rate yet, so moving the class on would cut the writing short.
 */
export function tableIsRating(table: Pick<ClassTable, 'step'>): boolean {
	return table.step === 'rate';
}

export interface ClassStatusInput {
	status: LessonStatus;
	stepKey: LessonStepKey;
	/** Students on the roster, and the class size when the teacher set one. */
	joined: number;
	classSize: number | null;
	/** Opening: what the projector shows (already in words). */
	projectorWhat: string;
	/** Students who chose a side / students counted for it. */
	chose: number;
	sideTotal: number;
	tableCount: number;
	/** Students on the roster seated at no table. */
	unseated: number;
	tablesDone: number;
	/** Tables really at the rating part of Proposals (see `tableIsRating`). */
	tablesRating: number;
	/** All proposals: the rated-everything line; `complete` when every student and every proposal is covered. */
	allRated: { n: number; m: number; k: number; complete: boolean } | null;
	ballotFrozen: boolean;
	ballotPaused: boolean;
	ballotClosed: boolean;
	voted: number;
	present: number;
	resultsShown: boolean;
	/** Numbers of the tables that have waited longer than the stuck rule allows. */
	stuckTables: readonly number[];
}

export interface StuckItem {
	textKey: 'console.status.stuck_one' | 'console.status.stuck_many';
	params: Record<string, number>;
	/** The first stuck table: "Show" jumps to its card. */
	firstTable: number;
}

export interface ClassStatus {
	/** Paused, open and ended lessons say it in the banner. */
	hidden: boolean;
	textKey: string;
	params: Record<string, string | number>;
	/** The step's "ready" rule holds: the view shows "Ready to move on". */
	ready: boolean;
	/** Dividing into tables: students still seated nowhere ("Show" jumps to the strip). */
	unseated: number;
	stuck: StuckItem | null;
}

const NOT_SHOWN: ClassStatus = {
	hidden: true,
	textKey: '',
	params: {},
	ready: false,
	unseated: 0,
	stuck: null,
};

function stuckItemOf(tables: readonly number[]): StuckItem | null {
	if (tables.length === 0) return null;
	const sorted = [...tables].sort((a, b) => a - b);
	if (sorted.length === 1) {
		return {
			textKey: 'console.status.stuck_one',
			params: { t: sorted[0] },
			firstTable: sorted[0],
		};
	}

	return {
		textKey: 'console.status.stuck_many',
		params: { n: sorted.length },
		firstTable: sorted[0],
	};
}

function line(
	textKey: string,
	params: Record<string, string | number>,
	ready: boolean,
	extra: Partial<ClassStatus> = {},
): ClassStatus {
	return { hidden: false, textKey, params, ready, unseated: 0, stuck: null, ...extra };
}

function waitingLine(input: ClassStatusInput): ClassStatus {
	if (input.classSize === null) {
		return line('console.status.joined_open', { n: input.joined }, false);
	}

	return line(
		'console.status.joined',
		{ n: input.joined, total: input.classSize },
		input.joined > 0 && input.joined >= input.classSize,
	);
}

function tablesLine(input: ClassStatusInput): ClassStatus {
	if (input.tableCount === 0) return line('console.status.no_tables', {}, false);
	if (input.unseated > 0) {
		return line('console.unplaced_live', { count: input.unseated }, false, {
			unseated: input.unseated,
		});
	}

	return line('console.status.seated', { t: input.tableCount }, true);
}

function voteLine(input: ClassStatusInput): ClassStatus {
	const counts = { voted: input.voted, present: input.present };
	if (input.ballotClosed) return line('console.vote_status_closed', {}, true);
	if (!input.ballotFrozen) return line('console.vote_status_not_open', {}, false);
	const everyone = input.present > 0 && input.voted >= input.present;
	if (input.ballotPaused) return line('console.status.vote_paused', counts, everyone);
	if (everyone) return line('console.all_voted', {}, true);
	if (input.present === 0) return line('console.vote_status_open', {}, false);

	return line('console.vote_progress', counts, false);
}

/** The status line of the console's current step. */
export function classStatusFor(input: ClassStatusInput): ClassStatus {
	if (input.status !== 'live') return NOT_SHOWN;
	const stuck = stuckItemOf(input.stuckTables);
	switch (input.stepKey) {
		case 'waiting':
			return waitingLine(input);
		case 'opening':
			return line('console.status.on_projector', { what: input.projectorWhat }, false);
		case 'side':
			return line(
				'console.sides_count',
				{ chose: input.chose, total: input.sideTotal },
				input.sideTotal > 0 && input.chose >= input.sideTotal,
			);
		case 'tables':
			return tablesLine(input);
		case 'tableTalk':
			return line(
				'console.status.tables_done',
				{ n: input.tablesDone, m: input.tableCount },
				input.tableCount > 0 && input.tablesDone >= input.tableCount,
				{ stuck },
			);
		case 'proposals':
			return line(
				'console.status.tables_rating',
				{ n: input.tablesRating, m: input.tableCount },
				input.tableCount > 0 && input.tablesRating >= input.tableCount,
				{ stuck },
			);
		case 'allProposals': {
			const rated = input.allRated;
			if (!rated) return line('console.status.no_tables', {}, false);

			return line('console.all_rated_line', { n: rated.n, m: rated.m, k: rated.k }, rated.complete);
		}
		case 'vote':
			return voteLine(input);
		case 'summary':
			return line(
				input.resultsShown ? 'console.results_chip_shown' : 'console.results_chip_closed',
				{},
				input.resultsShown,
			);
		default:
			return NOT_SHOWN;
	}
}

// ---- announcements (design 4.2): only transitions, never every change -------------------

export interface StatusSnapshot {
	stepKey: LessonStepKey;
	status: LessonStatus;
	ready: boolean;
	stuckTables: readonly number[];
}

export interface Announcement {
	key: string;
	params: Record<string, string | number>;
}

/**
 * What the hidden live region should say, given the previous and the current moment. At most
 * one thing, by priority: the lesson's status, the step, "ready", a newly stuck table.
 */
export function announcementFor(
	prev: StatusSnapshot | null,
	next: StatusSnapshot,
	words: { stepName: string; primaryLabel: string },
): Announcement | null {
	if (prev === null) return null;
	if (prev.status !== next.status) {
		if (next.status === 'paused') return { key: 'lesson.paused.title', params: {} };
		if (next.status === 'ended') return { key: 'console.ended_banner', params: {} };
		if (next.status === 'open') return { key: 'console.open_banner', params: {} };
	}
	if (prev.stepKey !== next.stepKey) {
		return { key: 'console.moved_to', params: { name: words.stepName } };
	}
	if (!prev.ready && next.ready) {
		return { key: 'console.ready_live', params: { label: words.primaryLabel } };
	}
	const known = new Set(prev.stuckTables);
	const fresh = next.stuckTables.filter((n) => !known.has(n));
	if (fresh.length > 0) {
		const item = stuckItemOf(next.stuckTables);

		return item ? { key: item.textKey, params: item.params } : null;
	}

	return null;
}
