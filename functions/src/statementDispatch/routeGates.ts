import { Statement, StatementType } from '@freedi/shared-types';
import { computeMembershipEvents } from '../engagement/joinForm/joinSheetMath';

/**
 * Pure checks deciding which handlers a statement write reaches.
 *
 * Rule for every gate: when it returns false, the handler would have done
 * nothing for this write. A gate may be broader than the handler's own check
 * (the handler then still exits by itself) but must never be narrower.
 * `gateEquivalence.test.ts` runs the real handlers to hold this rule.
 *
 * Where the handler's next check needs no read, the gate stops at the simple
 * part, so handler logic is not copied here. Gates are exact only where they
 * save a document read.
 */
export interface StatementChange {
	kind: 'create' | 'update' | 'delete';
	before?: Statement;
	after?: Statement;
}

export type StatementGate = (change: StatementChange) => boolean;

const DELIBERATION_TYPES: readonly string[] = ['option', 'synthesis'];

function isDeliberationType(statement: Statement | undefined): boolean {
	return statement !== undefined && DELIBERATION_TYPES.includes(statement.statementType);
}

function consensusChanged({ before, after }: StatementChange): boolean {
	return before?.consensus !== after?.consensus;
}

/** Threshold crossings depend only on these two values, so equal values cannot cross. */
function scoreChanged(change: StatementChange): boolean {
	return (
		consensusChanged(change) || change.before?.totalEvaluators !== change.after?.totalEvaluators
	);
}

function isOfficialParagraph({ after }: StatementChange): boolean {
	return Boolean(after?.doc?.isOfficialParagraph);
}

const optionMembershipChanged: StatementGate = ({ before, after }) => {
	const subject = after ?? before;

	return (
		subject?.statementType === StatementType.option &&
		computeMembershipEvents(before, after).length > 0
	);
};

export const STATEMENT_GATES = {
	queueDeliberation: ({ before, after }: StatementChange) =>
		isDeliberationType(before) || isDeliberationType(after),
	fn_syncOptionMembersToSheet: optionMembershipChanged,
	fn_backupOptionMembership: optionMembershipChanged,
	onStatementCreatedMarkCondensationStale: ({ kind }: StatementChange) => kind === 'create',
	fn_syncParagraphChildrenToDescription: ({ before, after }: StatementChange) =>
		before?.statementType === StatementType.paragraph ||
		after?.statementType === StatementType.paragraph,
	fn_pruneVersionHistory: isOfficialParagraph,
	fn_autoRemoveParagraph: (change: StatementChange) =>
		isOfficialParagraph(change) && scoreChanged(change),
	fn_autoAddParagraph: (change: StatementChange) =>
		!isOfficialParagraph(change) && scoreChanged(change),
	fn_createReplacementQueueItem: (change: StatementChange) =>
		!isOfficialParagraph(change) && consensusChanged(change),
	fn_updateQueueConsensus: consensusChanged,
	updateOptionInMassConsensus: ({ before, after }: StatementChange) =>
		before?.statementType !== after?.statementType && after?.statementType === StatementType.option,
	mirrorQuestionStatusToSurvey: ({ before, after }: StatementChange) =>
		Boolean(after?.questionSettings?.massConsensusSurveyId) &&
		before?.statementSettings?.questionStatus !== after?.statementSettings?.questionStatus,
	onVoteUpdate: ({ after }: StatementChange) => Boolean(after?.evidence),
} satisfies Record<string, StatementGate>;
