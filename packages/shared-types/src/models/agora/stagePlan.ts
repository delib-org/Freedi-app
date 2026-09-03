import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	record,
	enum_,
	picklist,
	InferOutput,
} from 'valibot';
import { AgoraStage, AGORA_STAGE_ORDER } from './agoraEnums';
import { CutoffBy } from '../results/ResultsSettings';
import { sessionRunsVoting } from './sessionFlow';
import type { AgoraSessionFlow } from './sessionFlow';
import type { AgoraSessionMode } from './agoraEnums';

/**
 * The stage plan — WHICH beats a session runs, in what order.
 *
 * The plan is the admin's design and is immutable once an item has opened;
 * everything the game learns while running an item (when it opened, what it
 * selected, why voting opened) lives in `stageState`, a map keyed by itemId
 * that the server updates by dot-path. Keeping the two apart means an
 * advance never rewrites the array a teacher may be editing, and a teacher's
 * edit of the upcoming items never clobbers a result already computed.
 *
 * `session.stage` keeps mirroring the KIND of the current item, so every
 * guard written as `session.stage !== deliberation` keeps holding; the plan
 * position is `session.stageIndex`. A session with no plan resolves to the
 * legacy order it always ran — see `resolveStagePlan`.
 */

export const AGORA_STAGE_PLAN = {
	MAX_ITEMS: 12,
	/** Longest question/explanation the admin may type */
	MAX_TITLE_LENGTH: 200,
	MAX_EXPLANATION_LENGTH: 1000,
} as const;

/**
 * The deliberation → voting auto-open rule, in NET agreement: the plain mean
 * of the students' −1…+1 ratings, no confidence penalty. One proposal the
 * room nearly all loves, or two it broadly likes, is enough to put the
 * question to a vote.
 */
export const AGORA_VOTING_TRIGGER = {
	SINGLE_MIN: 0.85,
	PAIR_MIN: 0.5,
	/** A single delighted rater is not a room — proposals below this are ignored */
	MIN_RATERS: 3,
} as const;

/** Which answers of a question stage travel forward; `all` carries every answer */
export const AgoraQuestionSelectionSchema = object({
	cutoffBy: enum_(CutoffBy),
	/** `topOptions`: how many */
	numberOfResults: number(),
	/** `aboveThreshold`: minimum net agreement, −1…1 */
	cutoffNumber: number(),
});

export type AgoraQuestionSelection = InferOutput<typeof AgoraQuestionSelectionSchema>;

export const AgoraVotingTriggerSchema = object({
	enabled: boolean(),
	singleMin: number(),
	pairMin: number(),
	minRaters: number(),
});

export type AgoraVotingTrigger = InferOutput<typeof AgoraVotingTriggerSchema>;

export const AgoraStagePlanItemSchema = object({
	/** Stable id — the fixed ends are 'lobby' and 'results'; the rest are minted by the editor */
	itemId: string(),
	stage: enum_(AgoraStage),
	/** question: what the room is asked */
	title: optional(string()),
	explanation: optional(string()),
	/** question: the question Statement, server-created when the plan is set */
	statementId: optional(string()),
	/** question: how many answers travel forward. Absent = the defaults in `resolveQuestionSelection` */
	selection: optional(AgoraQuestionSelectionSchema),
	/** deliberation: the auto-open-voting rule. Absent = off */
	votingTrigger: optional(AgoraVotingTriggerSchema),
});

export type AgoraStagePlanItem = InferOutput<typeof AgoraStagePlanItemSchema>;

export const AgoraStagePlanSchema = array(AgoraStagePlanItemSchema);

export type AgoraStagePlan = InferOutput<typeof AgoraStagePlanSchema>;

/** One answer as it was carried forward */
export const AgoraCarriedAnswerSchema = object({
	statementId: string(),
	statement: string(),
	/** Net agreement it held when the stage closed, −1…1 */
	mean: number(),
	raters: number(),
	/** Present in `named` sessions only */
	anonName: optional(string()),
});

export type AgoraCarriedAnswer = InferOutput<typeof AgoraCarriedAnswerSchema>;

/** What a question stage produced — written once, when the admin moves on */
export const AgoraStageOutcomeSchema = object({
	selected: array(AgoraCarriedAnswerSchema),
	/** AI summary of the selected answers (fixture text when no model is configured) */
	summary: optional(string()),
	computedAt: number(),
});

export type AgoraStageOutcome = InferOutput<typeof AgoraStageOutcomeSchema>;

export const AgoraStageTriggerModeSchema = picklist(['single', 'pair', 'manual']);

export type AgoraStageTriggerMode = InferOutput<typeof AgoraStageTriggerModeSchema>;

export const AgoraStageItemStateSchema = object({
	openedAt: optional(number()),
	outcome: optional(AgoraStageOutcomeSchema),
	/** voting: how the stage came to open */
	trigger: optional(AgoraStageTriggerModeSchema),
});

export type AgoraStageItemState = InferOutput<typeof AgoraStageItemStateSchema>;

/** `session.stageState[itemId]` */
export const AgoraStageStateSchema = record(string(), AgoraStageItemStateSchema);

export type AgoraStageState = InferOutput<typeof AgoraStageStateSchema>;

/** The slice of a session the plan helpers read */
export interface StagePlanSession {
	sessionMode?: AgoraSessionMode;
	flow?: AgoraSessionFlow | null;
	votingSettings?: { enabled?: boolean };
	stage: AgoraStage;
	stageIndex?: number;
	stagePlan?: AgoraStagePlan | null;
}

const ENDED_ITEM: AgoraStagePlanItem = { itemId: AgoraStage.ended, stage: AgoraStage.ended };

/** Stages that exist only because a scenario package has two characters */
export const AGORA_CHARACTER_STAGES: ReadonlySet<AgoraStage> = new Set([
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
]);

/** Stages an admin may place in a plan (the fixed ends included, `ended` never) */
export const AGORA_PLANNABLE_STAGES: readonly AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.question,
	AgoraStage.deliberation,
	AgoraStage.voting,
	AgoraStage.results,
];

/**
 * The plan a session with no plan runs: today's order, minus voting when the
 * session's knobs say it does not vote. This is the ONE place
 * `sessionRunsVoting` is consulted for sequencing — an explicit plan owns its
 * own voting item, and the two must never be checked side by side again (they
 * drifted once and a teacher's advance button dead-ended).
 */
export function legacyStagePlan(session: {
	sessionMode?: AgoraSessionMode;
	flow?: AgoraSessionFlow | null;
	votingSettings?: { enabled?: boolean };
}): AgoraStagePlanItem[] {
	const votes = sessionRunsVoting(session);

	return AGORA_STAGE_ORDER.filter(
		(stage) => stage !== AgoraStage.ended && (votes || stage !== AgoraStage.voting),
	).map((stage) => ({ itemId: stage, stage }));
}

/**
 * The session's plan with the terminal `ended` item appended, so every index
 * computation — including "advance past the last stage" — works on one array.
 * Stored plans never contain `ended`; `validateStagePlan` rejects it.
 */
export function resolveStagePlan(session: StagePlanSession): AgoraStagePlanItem[] {
	const base =
		session.stagePlan && session.stagePlan.length > 0
			? session.stagePlan
			: legacyStagePlan(session);

	return [...base, ENDED_ITEM];
}

/** Where a stage sits in the legacy order; the retired stage counts as its predecessor */
function legacyRank(stage: AgoraStage): number {
	if (stage === AgoraStage.valueIdentification) return AGORA_STAGE_ORDER.indexOf(AgoraStage.needs);
	if (stage === AgoraStage.question) return -1;

	return AGORA_STAGE_ORDER.indexOf(stage);
}

/**
 * The plan position the session is at. Explicit plans carry `stageIndex`;
 * a session without one (every session written before plans existed, and
 * civic sessions provisioned straight into deliberation) is placed by its
 * stage KIND — the last plan item whose kind is not later than the session's
 * stage in the legacy order, so a session sitting on a stage its plan does
 * not contain still resolves to a sane neighbour rather than to −1.
 */
export function currentPlanIndex(session: StagePlanSession): number {
	const plan = resolveStagePlan(session);
	if (
		session.stageIndex !== undefined &&
		session.stageIndex >= 0 &&
		session.stageIndex < plan.length &&
		plan[session.stageIndex].stage === session.stage
	) {
		return session.stageIndex;
	}

	const exact = plan.findIndex((item) => item.stage === session.stage);
	if (exact !== -1) return exact;

	const rank = legacyRank(session.stage);
	let best = 0;
	plan.forEach((item, index) => {
		if (legacyRank(item.stage) <= rank) best = index;
	});

	return best;
}

export function currentPlanItem(session: StagePlanSession): AgoraStagePlanItem {
	return resolveStagePlan(session)[currentPlanIndex(session)];
}

/** The item the teacher's "open next" button opens, or null at the very end */
export function nextPlanItem(session: StagePlanSession): AgoraStagePlanItem | null {
	const plan = resolveStagePlan(session);
	const next = currentPlanIndex(session) + 1;

	return next < plan.length ? plan[next] : null;
}

/** Has this item been opened (it is the current one, or an earlier one)? */
export function isItemOpened(session: StagePlanSession, itemId: string): boolean {
	const plan = resolveStagePlan(session);
	const index = plan.findIndex((item) => item.itemId === itemId);

	return index !== -1 && index <= currentPlanIndex(session);
}

/**
 * Resolve a stage KIND to a plan position: the first item of that kind after
 * the current one. −1 when the plan holds no such item ahead — which is how
 * the legacy `{stage}` request shape keeps working against a plan.
 */
export function planIndexForStage(session: StagePlanSession, stage: AgoraStage): number {
	const plan = resolveStagePlan(session);
	const current = currentPlanIndex(session);
	for (let index = current + 1; index < plan.length; index += 1) {
		if (plan[index].stage === stage) return index;
	}

	return -1;
}

/** The question items that have closed before `beforeIndex` — the carried context of a stage */
export function closedQuestionItems(
	session: StagePlanSession,
	beforeIndex: number,
): AgoraStagePlanItem[] {
	return resolveStagePlan(session)
		.slice(0, Math.max(0, beforeIndex))
		.filter((item) => item.stage === AgoraStage.question);
}

export type StagePlanError =
	| 'empty'
	| 'too_long'
	| 'must_start_lobby'
	| 'must_end_results'
	| 'ended_not_allowed'
	| 'duplicate_item_id'
	| 'lobby_only_first'
	| 'results_only_last'
	| 'voting_needs_source'
	| 'stage_needs_characters'
	| 'question_needs_title'
	| 'unknown_stage';

/**
 * Whether a plan can run. Errors are keys, not sentences — the editor
 * translates them, the server refuses on any.
 */
export function validateStagePlan(
	plan: readonly AgoraStagePlanItem[],
	options: { hasCharacters: boolean },
): StagePlanError[] {
	const errors: StagePlanError[] = [];
	if (plan.length === 0) return ['empty'];
	if (plan.length > AGORA_STAGE_PLAN.MAX_ITEMS) errors.push('too_long');
	if (plan[0].stage !== AgoraStage.lobby) errors.push('must_start_lobby');
	if (plan[plan.length - 1].stage !== AgoraStage.results) errors.push('must_end_results');

	const ids = new Set<string>();
	let sourceSeen = false;
	plan.forEach((item, index) => {
		if (ids.has(item.itemId)) errors.push('duplicate_item_id');
		ids.add(item.itemId);

		if (!AGORA_PLANNABLE_STAGES.includes(item.stage)) {
			errors.push(item.stage === AgoraStage.ended ? 'ended_not_allowed' : 'unknown_stage');
		}
		if (item.stage === AgoraStage.lobby && index !== 0) errors.push('lobby_only_first');
		if (item.stage === AgoraStage.results && index !== plan.length - 1) {
			errors.push('results_only_last');
		}
		if (item.stage === AgoraStage.voting && !sourceSeen) errors.push('voting_needs_source');
		if (item.stage === AgoraStage.deliberation || item.stage === AgoraStage.question) {
			sourceSeen = true;
		}
		if (AGORA_CHARACTER_STAGES.has(item.stage) && !options.hasCharacters) {
			errors.push('stage_needs_characters');
		}
		if (item.stage === AgoraStage.question && !(item.title ?? '').trim()) {
			errors.push('question_needs_title');
		}
	});

	return Array.from(new Set(errors));
}

export type AgoraStagePlanPreset = 'classic' | 'quickDecision';

/**
 * Starting points for the editor. `classic` is the lesson the game has always
 * run; `quickDecision` is a room deciding one thing: ask, propose, vote.
 */
export function stagePlanPreset(preset: AgoraStagePlanPreset): AgoraStagePlanItem[] {
	if (preset === 'classic') {
		return AGORA_STAGE_ORDER.filter((stage) => stage !== AgoraStage.ended).map((stage) => ({
			itemId: stage,
			stage,
		}));
	}

	return [
		{ itemId: AgoraStage.lobby, stage: AgoraStage.lobby },
		{
			itemId: 'question-1',
			stage: AgoraStage.question,
			title: '',
			selection: defaultQuestionSelection(),
		},
		{
			itemId: AgoraStage.deliberation,
			stage: AgoraStage.deliberation,
			votingTrigger: defaultVotingTrigger(),
		},
		{ itemId: AgoraStage.voting, stage: AgoraStage.voting },
		{ itemId: AgoraStage.results, stage: AgoraStage.results },
	];
}

export function defaultQuestionSelection(): AgoraQuestionSelection {
	return { cutoffBy: CutoffBy.topOptions, numberOfResults: 3, cutoffNumber: 0.5 };
}

export function defaultVotingTrigger(): AgoraVotingTrigger {
	return {
		enabled: true,
		singleMin: AGORA_VOTING_TRIGGER.SINGLE_MIN,
		pairMin: AGORA_VOTING_TRIGGER.PAIR_MIN,
		minRaters: AGORA_VOTING_TRIGGER.MIN_RATERS,
	};
}

export function resolveQuestionSelection(item: AgoraStagePlanItem): AgoraQuestionSelection {
	return item.selection ?? defaultQuestionSelection();
}

/**
 * Rank a question stage's answers by net agreement and apply the admin's
 * cutoff. Unrated answers sort last and are never carried by a threshold;
 * a top-N cutoff still takes them when nothing else is there, and `all`
 * carries everything in that order. The teacher panel previews with this,
 * the server closes with this — one arithmetic.
 */
export function rankCarriedAnswers(rows: readonly AgoraCarriedAnswer[]): AgoraCarriedAnswer[] {
	return [...rows].sort((a, b) => {
		const aRated = a.raters > 0 ? 1 : 0;
		const bRated = b.raters > 0 ? 1 : 0;
		if (aRated !== bRated) return bRated - aRated;
		if (b.mean !== a.mean) return b.mean - a.mean;
		if (b.raters !== a.raters) return b.raters - a.raters;

		return a.statementId < b.statementId ? -1 : a.statementId > b.statementId ? 1 : 0;
	});
}

export function selectCarriedAnswers(
	rows: readonly AgoraCarriedAnswer[],
	selection: AgoraQuestionSelection,
): AgoraCarriedAnswer[] {
	const ranked = rankCarriedAnswers(rows);
	if (selection.cutoffBy === CutoffBy.all) return ranked;
	if (selection.cutoffBy === CutoffBy.aboveThreshold) {
		return ranked.filter((row) => row.raters > 0 && row.mean >= selection.cutoffNumber);
	}

	return ranked.slice(0, Math.max(1, Math.round(selection.numberOfResults)));
}

export interface VotingTriggerRow {
	statementId: string;
	/** Net agreement, −1…1, students only */
	mean: number;
	/** Students who rated it */
	n: number;
}

export type VotingTriggerVerdict =
	| { fired: false; /** The best single-proposal net agreement among counted rows, for the teacher's line */ best: number | null }
	| { fired: true; mode: 'single' | 'pair'; candidateIds: string[] };

/**
 * Has the room agreed enough to vote? One proposal at `singleMin` outranks a
 * pair at `pairMin` — the ballot is then that one proposal, for or against.
 * Rows under `minRaters` are not counted at all: a proposal two friends loved
 * is not a room that agreed.
 */
export function evaluateVotingTrigger(
	rows: readonly VotingTriggerRow[],
	rule: AgoraVotingTrigger,
): VotingTriggerVerdict {
	if (!rule.enabled) return { fired: false, best: null };

	const counted = rows
		.filter((row) => row.n >= rule.minRaters && Number.isFinite(row.mean))
		.sort((a, b) => b.mean - a.mean || (a.statementId < b.statementId ? -1 : 1));

	if (counted.length === 0) return { fired: false, best: null };

	if (counted[0].mean >= rule.singleMin) {
		return { fired: true, mode: 'single', candidateIds: [counted[0].statementId] };
	}

	const pair = counted.filter((row) => row.mean >= rule.pairMin).slice(0, 2);
	if (pair.length === 2) {
		return { fired: true, mode: 'pair', candidateIds: pair.map((row) => row.statementId) };
	}

	return { fired: false, best: counted[0].mean };
}
