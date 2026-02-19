/**
 * VoteRules.ts - Pure business rules for voting.
 *
 * Contains validation and eligibility checks related to voting on
 * statements. All functions are pure with ZERO imports from React,
 * Firebase, or Redux.
 */

import { Statement, StatementType } from '@freedi/shared-types';

// ============================================================================
// VOTING ELIGIBILITY
// ============================================================================

/**
 * Check whether a statement is eligible to receive votes.
 *
 * Only statements of type `option` can be voted on.
 *
 * @param statement - The statement to check.
 * @returns `true` if the statement can receive votes.
 */
export function canVoteOnStatement(statement: Statement): boolean {
	return statement.statementType === StatementType.option;
}

/**
 * Determine whether voting is enabled for a parent statement's children.
 *
 * Voting is considered enabled unless the parent's settings explicitly
 * disable it via `enableAddVotingOption`.
 *
 * @param parentStatement - The parent statement whose settings control voting.
 * @returns `true` if voting is enabled.
 */
export function isVotingEnabledForParent(parentStatement: Statement): boolean {
	return parentStatement.statementSettings?.enableAddVotingOption !== false;
}

/**
 * Determine whether a vote action is a toggle-off (removing an existing vote)
 * or a new vote / vote change.
 *
 * A vote is a toggle-off when the user's existing vote is on the same
 * statement they are voting for again.
 *
 * @param existingVoteStatementId - The statementId of the user's current vote (or undefined if none).
 * @param targetStatementId       - The statementId the user is voting for now.
 * @returns `true` if this action would remove the existing vote.
 */
export function isVoteToggle(
	existingVoteStatementId: string | undefined,
	targetStatementId: string,
): boolean {
	if (!existingVoteStatementId) return false;

	return existingVoteStatementId === targetStatementId;
}

/**
 * Validate that a vote target is a valid option under the given parent.
 *
 * @param option          - The statement being voted on.
 * @param parentId        - The expected parent ID.
 * @returns An object with `valid` and an optional `reason` for invalidity.
 */
export function validateVoteTarget(
	option: Statement,
	parentId: string,
): { valid: boolean; reason?: string } {
	if (!option.statementId) {
		return { valid: false, reason: 'Option is missing a statementId' };
	}

	if (option.statementType !== StatementType.option) {
		return {
			valid: false,
			reason: `Cannot vote on a ${option.statementType}; only options are votable`,
		};
	}

	if (option.parentId !== parentId) {
		return {
			valid: false,
			reason: 'Option does not belong to the specified parent',
		};
	}

	return { valid: true };
}
