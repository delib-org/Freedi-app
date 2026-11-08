import {
	SUPPORT_MAX,
	SUPPORT_MIN,
	type ClassBallot,
	type ClassTable,
	type RoundPhase,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';

/**
 * Pure helpers of the projector (UX section 6): counts, tally bars, gate bars,
 * top proposals. No Firebase, no Mithril, so each rule is unit-testable.
 */

/** Projector shows at most this many proposals at the plenum (UX section 6). */
export const TOP_PROPOSALS_LIMIT = 5;
const PERCENT = 100;
const SUPPORT_SPAN = SUPPORT_MAX - SUPPORT_MIN;

/** The class-only keys on a statement's `statementSettings` (not in the shared type yet). */
interface ClassSettingsView {
	ballot?: Partial<ClassBallot>;
	roundPhase?: unknown;
}

function settingsOf(statement: Statement | null | undefined): ClassSettingsView {
	return (statement?.statementSettings ?? {}) as ClassSettingsView;
}

export function readBallot(challenge: Statement | null | undefined): ClassBallot | null {
	const ballot = settingsOf(challenge).ballot;
	if (!ballot || !Array.isArray(ballot.candidateIds)) return null;

	return {
		candidateIds: ballot.candidateIds.filter((id): id is string => typeof id === 'string'),
		frozenAt: typeof ballot.frozenAt === 'number' ? ballot.frozenAt : 0,
		closedAt: ballot.closedAt,
		pausedAt: ballot.pausedAt,
		decisionId: ballot.decisionId,
	};
}

export type VoteStatus = 'open' | 'paused' | 'closed';

/** What the wall says about the vote: closed wins over paused (a closed vote is no longer held). */
export function voteStatus(ballot: ClassBallot | null): VoteStatus {
	if (typeof ballot?.closedAt === 'number') return 'closed';
	if (typeof ballot?.pausedAt === 'number') return 'paused';

	return 'open';
}

export function readRoundPhase(challenge: Statement | null | undefined): RoundPhase {
	return settingsOf(challenge).roundPhase === 'improve' ? 'improve' : 'write';
}

// ---- counts -----------------------------------------------------------------

export interface TableCounts {
	tables: number;
	picking: number;
	talking: number;
	writing: number;
	rating: number;
}

/** Tables per step (pick / talk / write / rate) for the four count tiles. */
export function countTables(tables: readonly ClassTable[]): TableCounts {
	const counts: TableCounts = {
		tables: tables.length,
		picking: 0,
		talking: 0,
		writing: 0,
		rating: 0,
	};
	for (const table of tables) {
		if (table.step === 'pick') counts.picking += 1;
		else if (table.step === 'talk') counts.talking += 1;
		else if (table.step === 'write') counts.writing += 1;
		else if (table.step === 'rate') counts.rating += 1;
	}

	return counts;
}

/** True when the teacher sent every table to rating (the tiles then collapse). */
export function allTablesRating(counts: TableCounts): boolean {
	return counts.tables > 0 && counts.rating === counts.tables;
}

/** Students in the room: every subscription but the teacher's. */
export function studentsOf(
	roster: readonly StatementSubscription[],
	teacherId: string | undefined,
): StatementSubscription[] {
	return roster.filter((sub) => sub.userId !== teacherId);
}

export function displayNameOf(sub: StatementSubscription): string {
	return sub.user?.displayName ?? '';
}

export interface TableTile {
	n: number;
	names: string[];
}

/** One tile per table in table order: member names from the roster plus "no device" members. */
export function tableTiles(
	tables: readonly ClassTable[],
	roster: readonly StatementSubscription[],
): TableTile[] {
	const nameByUid = new Map<string, string>();
	for (const sub of roster) nameByUid.set(sub.userId, displayNameOf(sub));

	return tables.map((table) => ({
		n: table.n,
		names: [
			...table.memberUids.map((uid) => nameByUid.get(uid) ?? ''),
			...table.noDeviceMembers.map((member) => member.name),
		].filter((name) => name !== ''),
	}));
}

/** Names of students who have no table yet (the "no table" tile). */
export function unseatedNames(
	roster: readonly StatementSubscription[],
	teacherId: string | undefined,
): string[] {
	return studentsOf(roster, teacherId)
		.filter((sub) => !sub.tableId)
		.map(displayNameOf)
		.filter((name) => name !== '');
}

// ---- bars -------------------------------------------------------------------

export interface TallyBar {
	id: string;
	text: string;
	count: number;
	/** 0..100 of the leading bar, so the leader fills the track. */
	percent: number;
}

/** Live tally over the frozen ballot: votes from the challenge question's selections{}. */
export function tallyBars(
	candidateIds: readonly string[],
	selections: Record<string, number> | undefined,
	options: readonly Statement[],
): TallyBar[] {
	const textById = new Map(options.map((o) => [o.statementId, o.statement]));
	const counts = candidateIds.map((id) => ({
		id,
		text: textById.get(id) ?? '',
		count: Math.max(0, Number(selections?.[id] ?? 0)),
	}));
	const max = Math.max(1, ...counts.map((c) => c.count));

	return counts.map((c) => ({ ...c, percent: Math.round((c.count / max) * PERCENT) }));
}

export interface GateBar {
	id: string;
	text: string;
	consensus: number;
	/** 0..100 position of the consensus on the -1..+1 track. */
	percent: number;
	passed: boolean;
}

/** Position (0..100) of a -1..+1 value on a bar track. */
export function supportPercent(value: number): number {
	const clamped = Math.min(SUPPORT_MAX, Math.max(SUPPORT_MIN, value));

	return Math.round(((clamped - SUPPORT_MIN) / SUPPORT_SPAN) * PERCENT);
}

export function sortByConsensus(options: readonly Statement[]): Statement[] {
	return [...options].sort(
		(a, b) => (b.consensus ?? 0) - (a.consensus ?? 0) || a.statementId.localeCompare(b.statementId),
	);
}

/** Proposals ordered by consensus with whether each passed the gate. */
export function gateBars(options: readonly Statement[], gate: number): GateBar[] {
	return sortByConsensus(options).map((o) => ({
		id: o.statementId,
		text: o.statement,
		consensus: o.consensus ?? 0,
		percent: supportPercent(o.consensus ?? 0),
		passed: (o.consensus ?? 0) >= gate,
	}));
}

/** Top proposals for the plenum, up to TOP_PROPOSALS_LIMIT. */
export function topProposals(options: readonly Statement[]): Statement[] {
	return sortByConsensus(options).slice(0, TOP_PROPOSALS_LIMIT);
}

/** Proposals of the challenge question: visible options only. */
export function visibleProposals(options: readonly Statement[]): Statement[] {
	return options.filter((o) => o.hide !== true);
}
