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

function toActivity(statement: Statement, resolver: ActivityUrlResolver): DerivedActivity {
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
			? resolver.getParticipantLink(type, statement.statementId)
			: null,
		admin: def.hasAdminUrl ? resolver.getAdminLink(type, statement.statementId) : null,
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
