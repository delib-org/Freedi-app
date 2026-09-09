import { EvaluationUI, Role, SortType, Statement, StatementType } from '@freedi/shared-types';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import type { StatementView } from '@/routes/statementPaths';

/**
 * Pure decisions behind the question screen, kept out of the components so
 * they can be table-tested: who counts as a host, whether the add bar is
 * open, which tabs exist, which views belong to the Results tab.
 */

export type AddAnswerState = 'open' | 'closed' | 'host-only' | 'halted';

export function isHostRole(role: Role | undefined): boolean {
	return role === Role.admin || role === Role.creator;
}

/** The setting that lets participants add, for the rating UI this question runs. */
export function canParticipantsAddAnswers(statement: Statement | undefined): boolean {
	if (!statement) return false;
	const ui = statement.evaluationSettings?.evaluationUI;
	const settings = statement.statementSettings;
	if (ui === EvaluationUI.voting) return settings?.enableAddVotingOption ?? false;
	if (ui === EvaluationUI.suggestions) return settings?.enableAddEvaluationOption ?? false;

	return false;
}

export function getAddAnswerState({
	isHost,
	canParticipantsAdd,
	isHalted,
}: {
	isHost: boolean;
	canParticipantsAdd: boolean;
	isHalted: boolean;
}): AddAnswerState {
	if (isHalted) return 'halted';
	if (canParticipantsAdd) return 'open';
	if (isHost) return 'host-only';

	return 'closed';
}

export function isAddAnswerEnabled(state: AddAnswerState): boolean {
	return state === 'open' || state === 'host-only';
}

export type QuestionTabId = 'chat' | 'options' | 'results' | 'questions' | 'agreement';

export interface QuestionSegment {
	id: QuestionTabId;
	label: string;
	count?: number;
}

export interface BuildSegmentsArgs {
	statement: Statement | undefined;
	isHost: boolean;
	counts: { chat: number; options: number; questions: number };
	labels: Record<QuestionTabId, string>;
	/** Whether a covenant exists for the question (the Agreement tab then shows to everyone). */
	hasCovenant?: boolean;
}

/**
 * Discussion · Answers · Results · Agreement · Follow-ups. Answers/Results
 * exist when the question can hold answers; Agreement when it can AND (a
 * covenant exists, or the viewer hosts and may start one); Follow-ups when
 * nested questions are allowed AND (there is at least one, or the viewer
 * hosts and can add one).
 */
export function buildQuestionSegments({
	statement,
	isHost,
	counts,
	labels,
	hasCovenant = false,
}: BuildSegmentsArgs): QuestionSegment[] {
	const segments: QuestionSegment[] = [{ id: 'chat', label: labels.chat, count: counts.chat }];
	if (!statement) return segments;

	const canHaveAnswers = isStatementTypeAllowedAsChildren(statement, StatementType.option);
	if (canHaveAnswers) {
		segments.push({ id: 'options', label: labels.options, count: counts.options });
		segments.push({ id: 'results', label: labels.results });
		if (hasCovenant || isHost) segments.push({ id: 'agreement', label: labels.agreement });
	}

	const canHaveQuestions = isStatementTypeAllowedAsChildren(statement, StatementType.question);
	const followUpsAllowed =
		canHaveQuestions && statement.statementSettings?.enableAddNewSubQuestionsButton !== false;
	if (canHaveQuestions && (counts.questions > 0 || (isHost && followUpsAllowed))) {
		segments.push({ id: 'questions', label: labels.questions, count: counts.questions });
	}

	return segments;
}

/** Views the Results tab owns: its own body plus the two inline analysis maps. */
export const RESULTS_VIEWS: readonly StatementView[] = [
	'results',
	'agreement-map',
	'polarization-index',
];

export function isResultsView(view: StatementView | undefined): boolean {
	return view !== undefined && RESULTS_VIEWS.includes(view);
}

export function isAgreementView(view: StatementView | undefined): boolean {
	return view === 'agreement';
}

/** Which segment to highlight for a URL view (Results claims its sub-views). */
export function resolveQuestionTab(
	view: StatementView | undefined,
	fallbackTab: 'chat' | 'options' | 'questions',
): QuestionTabId {
	if (isResultsView(view)) return 'results';
	if (isAgreementView(view)) return 'agreement';
	if (view === 'chat' || view === 'options' || view === 'questions') return view;
	if (view === 'vote') return 'options';

	return fallbackTab;
}

export interface SortChipDef {
	id: SortType;
	labelKey: string;
}

const ALL_SORTS: SortChipDef[] = [
	{ id: SortType.newest, labelKey: 'question.sortNewest' },
	{ id: SortType.mostUpdated, labelKey: 'question.sortMostUpdated' },
	{ id: SortType.mostJoined, labelKey: 'question.sortMostJoined' },
	{ id: SortType.random, labelKey: 'question.sortRandom' },
	{ id: SortType.accepted, labelKey: 'question.sortAgreement' },
];

/** Same filter the legacy bottom nav applied: no Agreement without live results, Joined replaces Updated when joining is on. */
export function getSortChips(statement: Statement | undefined): SortChipDef[] {
	const showEvaluation = statement?.statementSettings?.showEvaluation ?? true;
	const joiningEnabled = statement?.statementSettings?.joiningEnabled ?? false;

	return ALL_SORTS.filter((item) => {
		if (item.id === SortType.accepted && !showEvaluation) return false;
		if (item.id === SortType.mostJoined && !joiningEnabled) return false;
		if (item.id === SortType.mostUpdated && joiningEnabled) return false;

		return true;
	});
}

/**
 * Participants only see results once the host shows live results or the
 * question's clock has run out. Hosts always see them.
 */
export function canSeeResults({
	isHost,
	showLiveResults,
	isDeadlinePassed,
}: {
	isHost: boolean;
	showLiveResults: boolean;
	isDeadlinePassed: boolean;
}): boolean {
	return isHost || showLiveResults || isDeadlinePassed;
}

/**
 * Whether a discussion message can be turned into an answer from an inline
 * action: it is a plain message, its question can hold answers, the viewer
 * may edit it, and the question is not halted.
 */
export function canMakeAnswer({
	statement,
	parent,
	isAuthorized,
	isHalted,
}: {
	statement: Statement;
	parent: Statement | undefined;
	isAuthorized: boolean;
	isHalted: boolean;
}): boolean {
	if (!parent || !isAuthorized || isHalted) return false;
	if (statement.statementType !== StatementType.statement) return false;

	return isStatementTypeAllowedAsChildren(parent, StatementType.option);
}
