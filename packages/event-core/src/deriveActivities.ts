import {
	getActivityType,
	getActivityDef,
	isActivityStatement,
	type ActivityTypeDef,
	type QuestionStatus,
	type Statement,
	ActivityType,
} from '@freedi/shared-types';
import type { ActivityLink, ActivityUrlResolver } from './activityUrls';

/**
 * Event Control Center — activity derivation (framework-agnostic).
 *
 * Turns an event's anchor group + its direct child Statements into a unified,
 * ordered activity list. Pure read layer: no writes, no new documents — the
 * Event is an optional index over the existing Statement subtree.
 */

/**
 * The universal run-state vocabulary shown to facilitators.
 *
 * `queued` stays in the union for engines that will one day declare a
 * not-yet-started state explicitly; no engine writes it today (see toRunState).
 */
export type ActivityRunState = 'queued' | 'open' | 'frozen' | 'closed';

export interface DerivedActivity {
	statementId: string;
	title: string;
	order: number;
	type: ActivityType;
	def: ActivityTypeDef;
	runState: ActivityRunState;
	participant: ActivityLink | null;
	admin: ActivityLink | null;
	/** Mass-Consensus survey wrapping this question (set up from Studio), if any. */
	surveyId?: string;
}

/**
 * Map a question's `statementSettings.questionStatus` onto the run-state pill.
 *
 * An UNDEFINED status means OPEN, not queued: the Join app (and every other
 * engine) treats a question with no `questionStatus` as live — participants
 * can suggest and evaluate the moment it exists, and the field is only
 * written when a facilitator explicitly freezes/closes/re-opens it. Showing
 * such a question as "Queued" would tell the facilitator it is not running
 * while participants are already inside it.
 */
function toRunState(status: QuestionStatus | undefined): ActivityRunState {
	switch (status) {
		case 'frozen':
			return 'frozen';
		case 'closed':
			return 'closed';
		case 'live':
		default:
			return 'open';
	}
}

function toActivity(statement: Statement, resolver: ActivityUrlResolver): DerivedActivity {
	const type = getActivityType(statement);
	const def = getActivityDef(type);
	const runState =
		def.statusSource === 'questionStatus'
			? toRunState(statement.statementSettings?.questionStatus)
			: 'open';

	const surveyId =
		type === ActivityType.massConsensus
			? statement.questionSettings?.massConsensusSurveyId
			: undefined;
	const surveyLinks = surveyId ? resolver.getSurveyLinks(surveyId) : null;

	return {
		statementId: statement.statementId,
		title: statement.statement,
		order: statement.order ?? 0,
		type,
		def,
		runState,
		surveyId,
		participant: surveyLinks
			? surveyLinks.participant
			: def.hasParticipantUrl
			? resolver.getParticipantLink(type, statement.statementId)
			: null,
		admin: surveyLinks
			? surveyLinks.admin
			: def.hasAdminUrl
				? resolver.getAdminLink(type, statement.statementId)
				: null,
	};
}

/**
 * Derive the ordered activity list for an event from the anchor group's direct
 * children. Only children that classify as a known activity are included.
 */
export function deriveActivities(
	children: Statement[],
	resolver: ActivityUrlResolver,
): DerivedActivity[] {
	return children
		.filter(isActivityStatement)
		.map((child) => toActivity(child, resolver))
		.sort((a, b) => a.order - b.order);
}
