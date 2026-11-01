import { PeopleAnchor } from '../hostHubLogic';

/**
 * Which People subsections a space shows, in the IA §4 order:
 * Who can join · Waiting (conditional) · Members · Questions on joining ·
 * Entry check (conditional) · Stakeholders · Joining answers & rooms
 * (questions only).
 */
export interface PeopleLayoutInput {
	isQuestion: boolean;
	/** Someone waits, or access is By approval (IA §7). */
	showWaiting: boolean;
	/** The space asks questions on joining, its own or the group's (A3). */
	hasJoinQuestions: boolean;
}

export function visiblePeopleAnchors({
	isQuestion,
	showWaiting,
	hasJoinQuestions,
}: PeopleLayoutInput): PeopleAnchor[] {
	const anchors: Array<PeopleAnchor | false> = [
		'join',
		showWaiting ? 'waiting' : false,
		'members',
		'questions',
		hasJoinQuestions ? 'entry-check' : false,
		'stakeholders',
		isQuestion ? 'joining' : false,
	];

	return anchors.filter((anchor): anchor is PeopleAnchor => anchor !== false);
}

export interface DefaultOpenInput {
	available: ReadonlyArray<PeopleAnchor>;
	waitingCount: number;
	toReviewCount: number;
	/** Nobody but the host has joined yet (a brand-new space). */
	isNewSpace: boolean;
}

/**
 * UX 4.1: open the first subsection with something to act on — Waiting to
 * join, else Entry check, else Who can join on a brand-new space — or none.
 */
export function pickDefaultOpen({
	available,
	waitingCount,
	toReviewCount,
	isNewSpace,
}: DefaultOpenInput): PeopleAnchor | null {
	const candidates: Array<[PeopleAnchor, boolean]> = [
		['waiting', waitingCount > 0],
		['entry-check', toReviewCount > 0],
		['join', isNewSpace],
	];
	const match = candidates.find(([anchor, applies]) => applies && available.includes(anchor));

	return match ? match[0] : null;
}

/** A space whose only subscription is its creator (or none) counts as new. */
export function isNewSpace(memberTotal: number | null): boolean {
	return memberTotal !== null && memberTotal <= 1;
}

/** "Open to all · same as the group": the parts that apply, joined by a middle dot. */
export function summaryLine(parts: ReadonlyArray<string | null | undefined | false>): string {
	return parts
		.filter((part): part is string => typeof part === 'string' && part !== '')
		.join(' · ');
}
