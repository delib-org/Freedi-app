import {
	ActivityType,
	getActivityType,
	getActivityDef,
	isActivityStatement,
	type ActivityTypeDef,
	type QuestionStatus,
	type Statement,
} from '@freedi/shared-types';
import {
	getActivityParticipantLink,
	getActivityAdminLink,
	type ActivityLink,
} from './activityUrls';

/**
 * Event Control Center — activity derivation (Phase 1).
 *
 * Turns an event's anchor group + its direct child Statements into a unified,
 * ordered list of activities the dashboard can render generically. This is a
 * pure read layer: no writes, no new documents — the Event is an optional index
 * over the existing Statement subtree.
 */

/** The universal run-state vocabulary shown to facilitators. */
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
}

/**
 * Map a Statement's `questionStatus` (live/frozen/closed) into the universal
 * activity run-state. A statement with no status set is treated as `queued`
 * (not yet opened to participants).
 */
function toRunState(status: QuestionStatus | undefined): ActivityRunState {
	switch (status) {
		case 'live':
			return 'open';
		case 'frozen':
			return 'frozen';
		case 'closed':
			return 'closed';
		default:
			return 'queued';
	}
}

function toActivity(statement: Statement): DerivedActivity {
	const type = getActivityType(statement);
	const def = getActivityDef(type);
	const runState =
		def.statusSource === 'questionStatus'
			? toRunState(statement.statementSettings?.questionStatus)
			: 'open';

	return {
		statementId: statement.statementId,
		title: statement.statement,
		order: statement.order ?? 0,
		type,
		def,
		runState,
		participant: def.hasParticipantUrl
			? getActivityParticipantLink(type, statement.statementId)
			: null,
		admin: def.hasAdminUrl ? getActivityAdminLink(type, statement.statementId) : null,
	};
}

/**
 * Derive the ordered activity list for an event from the anchor group's direct
 * children. Only children that classify as a known activity are included; the
 * rest (comments, stray options) are ignored.
 */
export function deriveActivities(children: Statement[]): DerivedActivity[] {
	return children
		.filter(isActivityStatement)
		.map(toActivity)
		.sort((a, b) => a.order - b.order);
}
