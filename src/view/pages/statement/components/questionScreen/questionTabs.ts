import { QuestionType, Statement, StatementType } from '@freedi/shared-types';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';

/**
 * The question screen's tab bar: רקע · דיון · תשובות · שאלות · תוצאות · מפות.
 * Pure — which tabs a statement offers, which one it opens on, and how every
 * `?tab=` value ever written (including the retired overview / summary /
 * covenant / themes) lands on one of them.
 */

export const QUESTION_TAB_ORDER = [
	'background',
	'chat',
	'options',
	'questions',
	'results',
	'maps',
] as const;
export type QuestionTabId = (typeof QUESTION_TAB_ORDER)[number];

/** Full-width sub-views that live under a tab (the covenant under Results, themes under Maps). */
export type QuestionSubView = 'covenant' | 'themes';

/** What the content area renders: a tab, or one of its sub-views. */
export type QuestionView = QuestionTabId | QuestionSubView;

export const TAB_LABEL_KEYS: Readonly<Record<QuestionTabId, string>> = {
	background: 'Background',
	chat: 'Discussion',
	options: 'Answers',
	questions: 'Questions',
	results: 'Results',
	maps: 'Maps',
};

const TAB_ALIASES: Readonly<Record<string, QuestionView>> = {
	background: 'background',
	chat: 'chat',
	main: 'chat',
	options: 'options',
	vote: 'options',
	questions: 'questions',
	results: 'results',
	overview: 'results',
	summary: 'results',
	covenant: 'covenant',
	agreement: 'covenant',
	maps: 'maps',
	themes: 'themes',
};

/** Map any `?tab=` value (current or legacy) to a view, or undefined for unknown values. */
export function resolveTabParam(param: string | null | undefined): QuestionView | undefined {
	if (!param) return undefined;

	return TAB_ALIASES[param];
}

/** The tab a view belongs to (sub-views highlight their parent tab). */
export function tabOfView(view: QuestionView): QuestionTabId {
	if (view === 'covenant') return 'results';
	if (view === 'themes') return 'maps';

	return view;
}

export interface QuestionTab {
	id: QuestionTabId;
	labelKey: string;
	count?: number;
	unreadCount?: number;
}

export interface BuildTabsArgs {
	statement: Statement | undefined;
	counts?: Partial<Record<'chat' | 'options' | 'questions', number>>;
	unreadChat?: number;
}

function isCompoundQuestion(statement: Statement): boolean {
	return (
		statement.statementType === StatementType.question &&
		statement.questionSettings?.questionType === QuestionType.compound
	);
}

/**
 * Tabs a statement offers, always in QUESTION_TAB_ORDER.
 * - Discussion: every statement.
 * - Background, Results, Maps: questions (Results also needs answers allowed).
 * - Answers / Questions: when that child type is allowed. A compound question
 *   runs its own phase screen on the discussion tab, so it has neither.
 */
export function buildQuestionTabs({
	statement,
	counts = {},
	unreadChat,
}: BuildTabsArgs): QuestionTab[] {
	const ids = new Set<QuestionTabId>(['chat']);
	if (statement) {
		const isQuestion = statement.statementType === StatementType.question;
		const compound = isCompoundQuestion(statement);
		const answersAllowed = isStatementTypeAllowedAsChildren(statement, StatementType.option);
		const questionsAllowed = isStatementTypeAllowedAsChildren(statement, StatementType.question);

		if (isQuestion) ids.add('background').add('maps');
		if (answersAllowed && !compound) ids.add('options');
		if (questionsAllowed && !compound) ids.add('questions');
		if (isQuestion && answersAllowed) ids.add('results');
	}

	return QUESTION_TAB_ORDER.filter((id) => ids.has(id)).map((id) => ({
		id,
		labelKey: TAB_LABEL_KEYS[id],
		count: id === 'chat' || id === 'options' || id === 'questions' ? counts[id] : undefined,
		unreadCount: id === 'chat' ? unreadChat : undefined,
	}));
}

/**
 * The tab a statement opens on: a host's explicit `statementSettings.defaultView`
 * when that tab exists, otherwise Answers when answers are allowed, otherwise
 * Discussion.
 */
export function getDefaultQuestionTab(
	statement: Statement | undefined,
	tabs: readonly QuestionTab[],
): QuestionTabId {
	const has = (id: QuestionTabId): boolean => tabs.some((tab) => tab.id === id);
	const explicit = resolveTabParam(statement?.statementSettings?.defaultView);
	if (explicit && has(tabOfView(explicit))) return tabOfView(explicit);
	if (has('options')) return 'options';

	return 'chat';
}

/**
 * The view to render for the current `?tab=` value: the requested view when its
 * tab is offered, otherwise the statement's default tab.
 */
export function resolveActiveView(
	param: string | null | undefined,
	statement: Statement | undefined,
	tabs: readonly QuestionTab[],
): QuestionView {
	const requested = resolveTabParam(param);
	if (requested && tabs.some((tab) => tab.id === tabOfView(requested))) return requested;

	return getDefaultQuestionTab(statement, tabs);
}

/** Views whose content replaces the reading column (no discussion brief, no decision board aside). */
export function isResultsOrMapsView(view: string): boolean {
	return ['background', 'results', 'maps', 'covenant', 'themes'].includes(view);
}
