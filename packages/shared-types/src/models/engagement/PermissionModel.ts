import { CreditAction } from './CreditAction';
import { EngagementLevel } from './EngagementModel';

/**
 * Maps actions to the minimum level required to perform them.
 *
 * Level 0 (Observer): Read only - browse, view results, read documents
 * Level 1 (Participant): + Evaluate, vote, react
 * Level 2 (Contributor): + Create comments, options, suggestions, subscribe
 * Level 3 (Advocate): + Create discussions, invite others
 * Level 4 (Leader): + Advanced analytics, community recognition
 */
export const ACTION_LEVEL_REQUIREMENTS: Record<string, EngagementLevel> = {
	// Level 0 - Observer (read-only)
	browse: EngagementLevel.OBSERVER,
	view_results: EngagementLevel.OBSERVER,
	read_document: EngagementLevel.OBSERVER,

	// Level 1 - Participant
	[CreditAction.EVALUATE_OPTION]: EngagementLevel.PARTICIPANT,
	[CreditAction.VOTE]: EngagementLevel.PARTICIPANT,
	[CreditAction.MC_PARTICIPATION]: EngagementLevel.PARTICIPANT,

	// Level 2 - Contributor
	[CreditAction.COMMENT]: EngagementLevel.CONTRIBUTOR,
	[CreditAction.CREATE_OPTION]: EngagementLevel.CONTRIBUTOR,
	[CreditAction.SIGN_DOCUMENT]: EngagementLevel.CONTRIBUTOR,

	// Level 3 - Advocate
	[CreditAction.INVITE_FRIEND]: EngagementLevel.ADVOCATE,
	create_discussion: EngagementLevel.ADVOCATE,
};

/**
 * Check if a user level meets the minimum requirement for an action.
 * Returns true if allowed, false if the action is gated.
 * Unknown actions default to allowed (Observer level).
 */
export function canPerformAction(
	userLevel: EngagementLevel,
	action: string
): boolean {
	const requiredLevel =
		ACTION_LEVEL_REQUIREMENTS[action] ?? EngagementLevel.OBSERVER;

	return userLevel >= requiredLevel;
}

/**
 * Get the minimum level required for an action.
 * Returns OBSERVER (0) for unknown actions.
 */
export function getRequiredLevel(action: string): EngagementLevel {
	return ACTION_LEVEL_REQUIREMENTS[action] ?? EngagementLevel.OBSERVER;
}
