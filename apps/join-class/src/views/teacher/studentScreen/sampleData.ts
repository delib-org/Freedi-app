import type { Camp, Statement, SupportBySide } from '@freedi/shared-types';
import type { VoteResult } from '@/lib/classroom/voteResults';
import { t } from '@/lib/i18n';

/**
 * What the "Student screen" sample shows in place of student-made content
 * (Trello 7S3Axkzd). The console can be mirrored to the room, so nothing a real
 * student wrote or did may appear: names, answers, proposals and vote shares are
 * fixed sample strings (i18n, `student_screen.*`) and constants. The lesson's own
 * wording (question, intro, side names and claims, guiding questions) stays real.
 */

/** The table number shown on the sample phone. */
export const SAMPLE_TABLE_N = 3;
/** "Turn 1 of 3" on the sample table-talk screen. */
export const SAMPLE_TURN = 1;
export const SAMPLE_TURN_MAX = 3;
/** The "+0.5" face of the greyed rating rows. */
export const SAMPLE_RATING = 0.5;

/** Mean support of the sample summary bars, and the students behind each. */
const SAMPLE_SUPPORT: SupportBySide = {
	a: { mean: 0.6, n: 3, m: 4 },
	center: { mean: 0.4, n: 2, m: 3 },
	b: { mean: 0.5, n: 3, m: 3 },
	verdict: 'closer',
};

export interface SampleMate {
	key: string;
	name: string;
	camp: Camp;
	isMe: boolean;
}

const NAME_KEYS = [
	'student_screen.name_1',
	'student_screen.name_2',
	'student_screen.name_3',
] as const;
const CAMPS: readonly Camp[] = ['a', 'center', 'b'];
/** The sample student ("you") is the first of the three. */
const ME_INDEX = 0;

/** Three sample tablemates, one of them "you". */
export function sampleMates(): SampleMate[] {
	return NAME_KEYS.map((key, index) => ({
		key,
		name: t(key),
		camp: CAMPS[index],
		isMe: index === ME_INDEX,
	}));
}

const PROPOSAL_KEYS = [
	'student_screen.proposal_1',
	'student_screen.proposal_2',
	'student_screen.proposal_3',
] as const;
/** The proposal the sample student is writing (the second sample proposal). */
const DRAFT_INDEX = 1;

/** Sample proposals shaped like statements, for the shared cards (VoteList, TextCard). */
export function sampleProposals(): Statement[] {
	return PROPOSAL_KEYS.map(
		(key) => ({ statementId: `sample-${key}`, statement: t(key) }) as unknown as Statement,
	);
}

/** The proposal a sample student is writing. */
export function sampleDraft(): string {
	return t(PROPOSAL_KEYS[DRAFT_INDEX]);
}

/** Sample vote shares, one per sample proposal. */
const SAMPLE_SHARES: readonly VoteResult[] = [
	{ count: 12, percent: 50 },
	{ count: 8, percent: 33 },
	{ count: 4, percent: 17 },
];

export function sampleResults(proposals: readonly Statement[]): Record<string, VoteResult> {
	return Object.fromEntries(proposals.map((p, index) => [p.statementId, SAMPLE_SHARES[index]]));
}

export function sampleSupport(): SupportBySide {
	return SAMPLE_SUPPORT;
}
