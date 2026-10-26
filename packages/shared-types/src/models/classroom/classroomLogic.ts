import { CAMP_A_BELOW, CAMP_B_ABOVE, Camp, ClassTable } from './classroomModel';
import type { LessonPlan, LessonStatus, StatementSettings } from '../statement/StatementSettings';
import type { LessonStatusAction } from './classroomCallables';

/** What the lesson-setting readers need of the main statement (a `Statement` fits). */
export interface LessonSettingsHolder {
	statementSettings?: Pick<StatementSettings, 'allowOwnQuestions'> | null;
}

/** May students add a question of their own at Table talk? Absent = yes (IA 25.2). */
export function allowOwnQuestionsOf(main: LessonSettingsHolder | null | undefined): boolean {
	return main?.statementSettings?.allowOwnQuestions !== false;
}

/**
 * Own questions are off and every teacher question was already asked at this
 * table: nothing is left to pick (IA 25.4). `teacherQuestionIds` are the
 * lesson's guiding questions without a table of their own.
 */
export function noQuestionsLeft(
	table: Pick<ClassTable, 'usedQuestionIds'>,
	teacherQuestionIds: readonly string[],
	allowOwnQuestions: boolean,
): boolean {
	return !allowOwnQuestions && teacherQuestionIds.every((id) => table.usedQuestionIds.includes(id));
}

/** Camp of a slider value: <40 'a', >60 'b', otherwise 'center'. */
export function campOf(side: number): Camp {
	if (side < CAMP_A_BELOW) return 'a';
	if (side > CAMP_B_ABOVE) return 'b';

	return 'center';
}

export interface SupportSubscription {
	camp?: Camp;
	decisionSupport?: number;
}

/** Mean support of one camp. `n` = students who rated, `m` = students in the camp. */
export interface CampSupport {
	mean: number;
	n: number;
	m: number;
}

export type SupportVerdict = 'closer' | 'apart' | 'insufficient';

export interface SupportBySide {
	a: CampSupport;
	center: CampSupport;
	b: CampSupport;
	verdict: SupportVerdict;
}

/**
 * Support for the decision grouped by initial camp.
 *
 * Students without a `camp` are ignored. `m` counts every student of a camp,
 * `n` only those with a `decisionSupport`; `mean` is the plain mean over the n
 * (0 when n = 0).
 *
 * Verdict:
 *  - 'insufficient' when either pole camp (a or b) has n = 0 (nobody rated);
 *  - 'closer' when BOTH a.mean >= gate and b.mean >= gate (IA spec: the sides
 *    came closer);
 *  - 'apart' otherwise.
 * Callers pass `votingSettings.threshold ?? DEFAULT_GATE`; the gate is compared
 * directly with the mean support (-1..+1).
 */
export function supportBySide(subs: SupportSubscription[], gate: number): SupportBySide {
	const camps: Camp[] = ['a', 'center', 'b'];
	const sums: Record<Camp, { total: number; n: number; m: number }> = {
		a: { total: 0, n: 0, m: 0 },
		center: { total: 0, n: 0, m: 0 },
		b: { total: 0, n: 0, m: 0 },
	};
	for (const sub of subs) {
		if (!sub.camp) continue;
		const bucket = sums[sub.camp];
		bucket.m += 1;
		if (typeof sub.decisionSupport === 'number') {
			bucket.n += 1;
			bucket.total += sub.decisionSupport;
		}
	}
	const out: Record<Camp, CampSupport> = {
		a: { mean: 0, n: 0, m: 0 },
		center: { mean: 0, n: 0, m: 0 },
		b: { mean: 0, n: 0, m: 0 },
	};
	for (const camp of camps) {
		const { total, n, m } = sums[camp];
		out[camp] = { mean: n > 0 ? total / n : 0, n, m };
	}
	let verdict: SupportVerdict;
	if (out.a.n === 0 || out.b.n === 0) verdict = 'insufficient';
	else if (out.a.mean >= gate && out.b.mean >= gate) verdict = 'closer';
	else verdict = 'apart';

	return { a: out.a, center: out.center, b: out.b, verdict };
}

/**
 * The ballot's winner: most votes; tie -> higher consensus (missing = lowest);
 * still tied -> lexicographically lower id. Candidates are the keys of `tally`.
 * Throws on an empty tally.
 */
export function decideBallot(
	tally: Record<string, number>,
	consensus: Record<string, number>,
): string {
	const ids = Object.keys(tally);
	if (ids.length === 0) throw new RangeError('decideBallot: empty tally');
	const consensusOf = (id: string): number => consensus[id] ?? Number.NEGATIVE_INFINITY;

	return ids.reduce((best, id) => {
		if (tally[id] !== tally[best]) return tally[id] > tally[best] ? id : best;
		if (consensusOf(id) !== consensusOf(best)) {
			return consensusOf(id) > consensusOf(best) ? id : best;
		}

		return id < best ? id : best;
	});
}

/** The lesson's status; a plan without one is live. */
export function lessonStatusOf(plan: Pick<LessonPlan, 'status'> | undefined | null): LessonStatus {
	return plan?.status ?? 'live';
}

/** What a status move writes. `shiftMs` is the pause length to add to table timers (resume only). */
export interface LessonStatusChange {
	status: LessonStatus;
	statusAt: number;
	/** true: pausedAt is cleared. */
	clearPausedAt: boolean;
	pausedAt?: number;
	endedAt?: number;
	shiftMs: number;
	/** false when the move repeats the current status (nothing to write). */
	changed: boolean;
}

const STATUS_TARGET: Record<LessonStatusAction, LessonStatus> = {
	pause: 'paused',
	resume: 'live',
	end: 'ended',
	keepOpen: 'open',
	reopen: 'live',
};

const STATUS_SOURCES: Record<LessonStatusAction, readonly LessonStatus[]> = {
	pause: ['live', 'open'],
	resume: ['paused'],
	end: ['live', 'paused', 'open'],
	keepOpen: ['live', 'paused', 'open'],
	reopen: ['ended'],
};

/**
 * The lesson status machine (IA 13.6), pure. Throws RangeError for a move the
 * status does not allow. A move to the status the lesson already has is a
 * no-op (`changed: false`), so a retry after a lost reply is safe.
 */
export function planLessonStatus(
	plan: Pick<LessonPlan, 'status' | 'pausedAt'> | undefined | null,
	action: LessonStatusAction,
	now: number,
): LessonStatusChange {
	const current = lessonStatusOf(plan);
	const target = STATUS_TARGET[action];
	if (current === target) {
		return { status: current, statusAt: now, clearPausedAt: false, shiftMs: 0, changed: false };
	}
	if (!STATUS_SOURCES[action].includes(current)) {
		throw new RangeError(`Cannot ${action} a lesson that is ${current}`);
	}
	const change: LessonStatusChange = {
		status: target,
		statusAt: now,
		clearPausedAt: current === 'paused',
		shiftMs: 0,
		changed: true,
	};
	if (target === 'paused') change.pausedAt = now;
	if (action === 'resume') {
		const pausedAt = plan?.pausedAt;
		change.shiftMs = typeof pausedAt === 'number' ? Math.max(0, now - pausedAt) : 0;
	}
	if (target === 'ended' || target === 'open') change.endedAt = now;

	return change;
}

/**
 * Tablemates who may still ask: in seating order, not yet in `askedUids`, not
 * passed on asking, and not the current asker (whose turn is the one being
 * run). Empty = nobody is left to volunteer.
 */
export function notAskedUids(
	table: Pick<ClassTable, 'memberUids' | 'askerUid' | 'askedUids' | 'passedAskingUids'>,
): string[] {
	const done = new Set([...(table.askedUids ?? []), ...(table.passedAskingUids ?? [])]);

	return table.memberUids.filter((uid) => !done.has(uid) && uid !== table.askerUid);
}

/** The current speaker's minute is over (or nobody holds the floor yet). */
export function speakerTimeOver(table: Pick<ClassTable, 'speakerEndsAt'>, now: number): boolean {
	return typeof table.speakerEndsAt !== 'number' || table.speakerEndsAt <= now;
}

/** Everyone at the table has spoken or passed (the current speaker counts once their minute is over). */
export function everyoneSpoke(
	table: Pick<ClassTable, 'memberUids' | 'spokenUids' | 'speakerUid' | 'speakerEndsAt'>,
	now: number,
): boolean {
	const spoken = new Set(table.spokenUids);
	if (table.speakerUid && typeof table.speakerEndsAt === 'number' && table.speakerEndsAt <= now) {
		spoken.add(table.speakerUid);
	}

	return table.memberUids.length > 0 && table.memberUids.every((uid) => spoken.has(uid));
}

/**
 * Table talk is done for this table: every device member has asked or passed
 * on asking, and either nobody is asking or the current talk is over. With
 * own questions off (`noneLeft`, see `noQuestionsLeft`) it is also done once no
 * question is left to ask and the table is not mid-talk (IA 25.2).
 */
export function tableDone(
	table: Pick<
		ClassTable,
		| 'memberUids'
		| 'askerUid'
		| 'askedUids'
		| 'passedAskingUids'
		| 'spokenUids'
		| 'speakerUid'
		| 'speakerEndsAt'
	>,
	now: number,
	noneLeft = false,
): boolean {
	const talkOver = table.askerUid === null || everyoneSpoke(table, now);

	return (notAskedUids(table).length === 0 || noneLeft) && talkOver;
}

/** Uids that answered or passed this question; the speaker counts once their minute is over. */
function answeredSet(
	table: Pick<ClassTable, 'spokenUids' | 'speakerUid' | 'speakerEndsAt'>,
	now: number,
): Set<string> {
	const spoken = new Set(table.spokenUids);
	if (table.speakerUid && typeof table.speakerEndsAt === 'number' && table.speakerEndsAt <= now) {
		spoken.add(table.speakerUid);
	}

	return spoken;
}

/** Nobody holds a running minute (Table talk "floor open"). */
export function floorOpen(table: Pick<ClassTable, 'speakerEndsAt'>, now: number): boolean {
	return speakerTimeOver(table, now);
}

/** Some tablemate other than the asker actually answered this question (a pass does not count). */
export function othersAnswered(
	table: Pick<
		ClassTable,
		'askerUid' | 'spokenUids' | 'speakerUid' | 'speakerEndsAt' | 'passedSpeakingUids'
	>,
	now: number,
): boolean {
	const passed = new Set(table.passedSpeakingUids ?? []);

	return [...answeredSet(table, now)].some((uid) => uid !== table.askerUid && !passed.has(uid));
}

/**
 * The asker may answer: one other tablemate answered, or every other tablemate
 * answered or passed (a table where everyone else passed cannot stall).
 */
export function askerMayAnswer(
	table: Pick<
		ClassTable,
		| 'memberUids'
		| 'askerUid'
		| 'spokenUids'
		| 'speakerUid'
		| 'speakerEndsAt'
		| 'passedSpeakingUids'
	>,
	now: number,
): boolean {
	if (othersAnswered(table, now)) return true;
	const done = answeredSet(table, now);

	return table.memberUids.filter((uid) => uid !== table.askerUid).every((uid) => done.has(uid));
}

/**
 * The table is choosing a question: at pick, or at talk once everyone answered
 * or passed; never once the table is done. The end of a turn needs no write.
 */
export function choosing(
	table: Pick<
		ClassTable,
		| 'step'
		| 'memberUids'
		| 'askerUid'
		| 'askedUids'
		| 'passedAskingUids'
		| 'spokenUids'
		| 'speakerUid'
		| 'speakerEndsAt'
	>,
	now: number,
	noneLeft = false,
): boolean {
	if (tableDone(table, now, noneLeft)) return false;

	return table.step === 'pick' || (table.step === 'talk' && everyoneSpoke(table, now));
}
