import { Role, Statement, StatementSubscription, StatementType } from '@freedi/shared-types';

/** Who is looking, as far as hidden answers are concerned. */
export interface AnswerHostContext {
	userId?: string;
	isSystemAdmin: boolean;
	subscriptionsByStatementId: ReadonlyMap<string, Pick<StatementSubscription, 'role'>>;
}

function isHostRole(role: Role | undefined): boolean {
	return role === Role.admin || role === Role.creator;
}

/**
 * Mirrors the rules' host check: a system admin, or an admin of the answer's
 * parent or top parent. An admin of the answer alone does not count, because
 * every author is one. A subscription the client has not loaded reads as "no";
 * the rules stay the authority.
 */
export function isHostOfAnswer(
	answer: Pick<Statement, 'parentId' | 'topParentId'>,
	context: AnswerHostContext,
): boolean {
	if (context.isSystemAdmin) return true;

	return (
		isHostRole(context.subscriptionsByStatementId.get(answer.parentId)?.role) ||
		isHostRole(context.subscriptionsByStatementId.get(answer.topParentId)?.role)
	);
}

/**
 * The hidden-answer rule of the answer cards, for every screen that lists
 * answers: hosts see them when "show hidden" is on, authors see their own.
 * Only answers are filtered; other statement types keep their own rules.
 */
export function canSeeAnswer(
	answer: Statement,
	context: AnswerHostContext,
	showHiddenCards: boolean,
): boolean {
	if (answer.statementType !== StatementType.option || answer.hide !== true) return true;
	if (isHostOfAnswer(answer, context)) return showHiddenCards;

	return answer.creatorId === context.userId;
}
