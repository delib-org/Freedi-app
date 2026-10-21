import {
	SUPPORT_MAX,
	SUPPORT_MIN,
	type ClassTable,
	type Statement,
	type SupportBySide,
	type TableStep,
} from '@freedi/shared-types';

/**
 * Pure rules of the student table screens (lane C3): countdown text, the
 * sub-step strip, speaker chips, the rate list order, the plenum order and the
 * support bars. No Firebase, no DOM: tested in plain vitest.
 */

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
/** The last seconds of a minute switch to two digits in the warning colour. */
export const WARN_SECONDS = 10;
/** Screen-reader updates of the countdown: every 10 s and at 10, 5, 0. */
export const ANNOUNCE_STEP_SECONDS = 10;
const ANNOUNCE_AT = [10, 5, 0];

// ---- countdown ---------------------------------------------------------------

export interface CountdownView {
	/** "1:00" / "0:34" / "09"; empty when the time is over. */
	text: string;
	seconds: number;
	warn: boolean;
	over: boolean;
	/** 0..1 of the interval still left (for the bar). */
	fraction: number;
}

function pad2(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

/** What the countdown shows for `remainingMs` left of a `totalMs` interval. */
export function countdownView(remainingMs: number, totalMs: number): CountdownView {
	const left = Math.max(0, remainingMs);
	const seconds = Math.ceil(left / MS_PER_SECOND);
	const fraction = totalMs > 0 ? Math.min(1, left / totalMs) : 0;
	if (seconds <= 0) return { text: '', seconds: 0, warn: false, over: true, fraction: 0 };
	if (seconds <= WARN_SECONDS) {
		return { text: pad2(seconds), seconds, warn: true, over: false, fraction };
	}
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);

	return {
		text: `${minutes}:${pad2(seconds % SECONDS_PER_MINUTE)}`,
		seconds,
		warn: false,
		over: false,
		fraction,
	};
}

/** True when a screen reader should hear the countdown now (10 s steps, 10, 5, 0). */
export function shouldAnnounce(seconds: number): boolean {
	return seconds % ANNOUNCE_STEP_SECONDS === 0 || ANNOUNCE_AT.includes(seconds);
}

/** The text of the digits before anyone has started the minute ("1:00"). */
export function idleCountdownText(totalSeconds: number): string {
	return countdownView(totalSeconds * MS_PER_SECOND, totalSeconds * MS_PER_SECOND).text;
}

// ---- sub-step strip -----------------------------------------------------------

export type FlowKind = 'tableTalk' | 'proposals';

export const TABLE_SUBSTEPS: Record<FlowKind, readonly TableStep[]> = {
	tableTalk: ['pick', 'talk', 'write', 'rate'],
	proposals: ['talk', 'write', 'rate'],
};

/** The table's official step as a screen of this flow (Proposals has no pick). */
export function officialSubstep(kind: FlowKind, table: ClassTable | null): TableStep {
	const step = table?.step ?? (kind === 'proposals' ? 'talk' : 'pick');

	return TABLE_SUBSTEPS[kind].includes(step) ? step : TABLE_SUBSTEPS[kind][0];
}

export interface SubstepOverride {
	step: TableStep;
	officialAtPick: TableStep;
	turnAtPick: number;
}

export interface SubstepView {
	/** The screen the student is looking at. */
	current: TableStep;
	/** The table's official step (marked in the strip). */
	official: TableStep;
	/** True when the student looked away from the official step. */
	detached: boolean;
}

/** `override` is the student's own pick; it lapses when the table moves on. */
export function resolveSubstep(
	kind: FlowKind,
	table: ClassTable | null,
	override: SubstepOverride | null,
): SubstepView {
	const official = officialSubstep(kind, table);
	const turn = table?.turn ?? 0;
	const live =
		override !== null && override.officialAtPick === official && override.turnAtPick === turn;
	const current = live && override ? override.step : official;

	return { current, official, detached: current !== official };
}

// ---- speakers -----------------------------------------------------------------

export interface Mate {
	uid: string;
	name: string;
}

export interface SpeakerChip {
	uid: string;
	name: string;
	spoken: boolean;
	speaking: boolean;
}

export function speakerChips(table: ClassTable, mates: readonly Mate[]): SpeakerChip[] {
	return mates.map((mate) => ({
		uid: mate.uid,
		name: mate.name,
		spoken: table.spokenUids.includes(mate.uid) || mate.uid === table.speakerUid,
		speaking: mate.uid === table.speakerUid,
	}));
}

/** Asker always; everyone once the speaker's minute is over. */
export function canPickNextSpeaker(table: ClassTable, uid: string, timeUp: boolean): boolean {
	return table.askerUid === uid || (timeUp && !!table.speakerUid);
}

export function allSpoke(table: ClassTable, mates: readonly Mate[]): boolean {
	return (
		mates.length > 0 &&
		mates.every((mate) => table.spokenUids.includes(mate.uid) || mate.uid === table.speakerUid)
	);
}

/** "סיימנו, לכתוב": asker always; everyone once all have spoken (Proposals: after the timer). */
export function canFinishTalk(
	kind: FlowKind,
	table: ClassTable,
	uid: string,
	mates: readonly Mate[],
	timeUp: boolean,
): boolean {
	if (table.askerUid === uid) return true;
	if (kind === 'proposals') return timeUp;

	return timeUp && allSpoke(table, mates);
}

// ---- rate list ---------------------------------------------------------------

export interface RateContext {
	uid: string;
	tableId: string | null;
	challengeId: string | null;
}

/**
 * Own items are never listed: what I wrote, what I co-authored, and (answers
 * only) everything my table wrote. Hidden statements are never listed.
 */
export function isOwnItem(item: Statement, ctx: RateContext): boolean {
	if (item.creatorId === ctx.uid) return true;
	const marker = item.classTable;
	if (marker?.coAuthors.includes(ctx.uid)) return true;
	const isProposal = ctx.challengeId !== null && item.parentId === ctx.challengeId;

	return !isProposal && !!marker && !!ctx.tableId && marker.tableId === ctx.tableId;
}

export function listableItems(items: readonly Statement[], ctx: RateContext): Statement[] {
	return items.filter((item) => !item.hide && !isOwnItem(item, ctx));
}

function newestFirst(a: Statement, b: Statement): number {
	return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

export interface RatePartition {
	open: Statement[];
	rated: Statement[];
}

/**
 * Unrated first, newest first. `ratedIds` is the set as of the last LIST
 * refresh (not the live ratings): a card never jumps while the finger is on it.
 */
export function partitionRateItems(
	items: readonly Statement[],
	ratedIds: ReadonlySet<string>,
): RatePartition {
	const open = items.filter((i) => !ratedIds.has(i.statementId)).sort(newestFirst);
	const rated = items.filter((i) => ratedIds.has(i.statementId)).sort(newestFirst);

	return { open, rated };
}

/** The plenum list: proposals by consensus, best first (ties: newest first). */
export function plenumOrder(proposals: readonly Statement[]): Statement[] {
	return [...proposals].sort(
		(a, b) => (b.consensus ?? 0) - (a.consensus ?? 0) || newestFirst(a, b),
	);
}

/** The student's own proposal (latest), if any. */
export function myProposal(proposals: readonly Statement[], uid: string): Statement | null {
	const mine = proposals
		.filter((p) => p.creatorId === uid || p.classTable?.coAuthors.includes(uid))
		.sort(newestFirst);

	return mine[0] ?? null;
}

// ---- support bars ------------------------------------------------------------

export type BarCamp = 'a' | 'center' | 'b';

export interface SupportBar {
	camp: BarCamp;
	mean: number;
	n: number;
	m: number;
	/** 0..100 width of the filled part of the bar. */
	percent: number;
}

/** Order of the bars: the two sides and the middle between them. */
export const BAR_ORDER: readonly BarCamp[] = ['a', 'center', 'b'];

export function supportPercent(mean: number): number {
	const clamped = Math.min(SUPPORT_MAX, Math.max(SUPPORT_MIN, mean));

	return Math.round(((clamped - SUPPORT_MIN) / (SUPPORT_MAX - SUPPORT_MIN)) * 100);
}

export function supportBars(result: SupportBySide): SupportBar[] {
	return BAR_ORDER.map((camp) => {
		const { mean, n, m } = result[camp];

		return { camp, mean, n, m, percent: n > 0 ? supportPercent(mean) : 0 };
	});
}

// ---- labels ------------------------------------------------------------------

const TABLE_ID_SEPARATOR = '--';

/** Table number out of a `${mainId}--${n}` id; null when it is not one. */
export function tableNumberOf(tableId: string | undefined): number | null {
	if (!tableId) return null;
	const n = Number(
		tableId.slice(tableId.lastIndexOf(TABLE_ID_SEPARATOR) + TABLE_ID_SEPARATOR.length),
	);

	return Number.isInteger(n) && n > 0 ? n : null;
}
