import type { ClassTable, LessonStepKey, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { storedClassSize } from '@/lib/classroom/classSize';
import {
	isBallotClosed,
	isBallotFrozen,
	isBallotPaused,
	isPlenum,
	rosterStudents,
	unplacedStudents,
} from '@/lib/classroom/consoleHelpers';
import { tableIsRating, type ClassStatusInput } from '@/lib/classroom/classStatus';
import { introVideoLabel, introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import { noneLeftNow } from '@/lib/classroom/ownQuestions';
import { sideCount } from '@/lib/classroom/sideCount';
import { serverNow } from '@/lib/classroom/serverClock';
import {
	STUCK_AFTER_MS,
	elapsedSinceChange,
	minuteRunning,
	statusLine,
	tableIsDone,
} from '@/lib/classroom/tableTurnConsole';
import { liveResultsOn, voteResults } from '@/lib/classroom/voteResults';
import { noDeviceTotal } from '@/lib/classroom/actFor';
import { getMainStatement } from '@/lib/store';
import { proposalsDoneNow } from './TableCard';

/**
 * Reads the live console state into the plain numbers `classStatusFor` needs. The rules live in
 * lib/classroom/classStatus.ts (tested); this file only counts what is on screen.
 */

export interface LiveStatusArgs {
	stepKey: LessonStepKey;
	challenge: Statement | null;
	status: ClassStatusInput['status'];
	allRated: ClassStatusInput['allRated'];
}

/** What the projector shows at Opening, in words: the introduction text or one video. */
function projectorWords(main: Statement | null): string {
	const video = projectorVideoOf(main);
	if (!video) return t('console.opening.text');
	const position = introVideosOf(main).findIndex((candidate) => candidate.id === video.id) + 1;

	return introVideoLabel(video, Math.max(position, 1));
}

/** A table "at rest" for the stuck rule: nobody has changed anything for too long. */
function isStuck(table: ClassTable, stepKey: LessonStepKey, now: number): boolean {
	if (stepKey === 'tableTalk') {
		const line = statusLine(table, 'tableTalk', now, noneLeftNow(table));

		return line?.elapsedMs !== undefined && line.elapsedMs >= STUCK_AFTER_MS;
	}
	if (stepKey !== 'proposals' || table.step !== 'talk') return false;
	if (proposalsDoneNow(table, 'proposals') || minuteRunning(table, now)) return false;

	return elapsedSinceChange(table, now) >= STUCK_AFTER_MS;
}

/** Votes cast on the running ballot, and the students in the room (with and without a device). */
export function voteCountsOn(challenge: Statement | null): { voted: number; present: number } {
	const ids = challenge?.statementSettings?.ballot?.candidateIds ?? [];
	const voted = Object.values(voteResults(ids, challenge?.selections)).reduce(
		(sum, result) => sum + result.count,
		0,
	);

	return {
		voted,
		present: rosterStudents(classState.roster).length + noDeviceTotal(classState.tables),
	};
}

export function liveStatusInput(args: LiveStatusArgs): ClassStatusInput {
	const main = getMainStatement();
	const students = rosterStudents(classState.roster);
	const tables = classState.tables;
	const now = serverNow();
	const mode = isPlenum(args.challenge)
		? 'plenum'
		: args.stepKey === 'tableTalk'
			? 'tableTalk'
			: 'proposals';
	const { chose, total } = sideCount(students);
	const { voted, present } = voteCountsOn(args.challenge);
	const doneAt = (table: ClassTable): boolean =>
		tableIsDone(table, mode, now, noneLeftNow(table), proposalsDoneNow(table, mode));

	return {
		status: args.status,
		stepKey: args.stepKey,
		joined: students.length,
		classSize: storedClassSize(main) ?? null,
		projectorWhat: projectorWords(main),
		chose,
		sideTotal: total,
		tableCount: tables.length,
		unseated: tables.length > 0 ? unplacedStudents(students, tables).length : 0,
		tablesDone: tables.filter(doneAt).length,
		tablesRating: tables.filter(tableIsRating).length,
		allRated: args.allRated,
		ballotFrozen: isBallotFrozen(args.challenge),
		ballotPaused: isBallotPaused(args.challenge),
		ballotClosed: isBallotClosed(args.challenge),
		voted,
		present,
		resultsShown: liveResultsOn(args.challenge),
		stuckTables: tables
			.filter((table) => isStuck(table, args.stepKey, now))
			.map((table) => table.n),
	};
}
