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
 * Questions never report `queued` (an undefined `questionStatus` is live, see
 * toRunState); Sign documents do — a hidden document is in admin review and
 * not yet open for comment (see toDocumentRunState).
 */
export type ActivityRunState = 'queued' | 'open' | 'frozen' | 'closed';

/**
 * The Sign app's per-document settings, as far as the run state is concerned.
 * A document Statement carries them as an untyped `signSettings` map (the
 * Statement schema does not declare it), so they are read defensively.
 */
export interface SignDocumentRunSettings {
	isHidden?: boolean;
	isFrozen?: boolean;
	enableSuggestions?: boolean;
}

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

function readBoolean(map: Record<string, unknown>, key: string): boolean | undefined {
	const value = map[key];

	return typeof value === 'boolean' ? value : undefined;
}

/** Typed accessor over the untyped `signSettings` map of a Sign document. */
export function getSignDocumentSettings(statement: Statement): SignDocumentRunSettings {
	const raw = (statement as unknown as { signSettings?: unknown }).signSettings;
	if (typeof raw !== 'object' || raw === null) return {};
	const map = raw as Record<string, unknown>;

	return {
		isHidden: readBoolean(map, 'isHidden'),
		isFrozen: readBoolean(map, 'isFrozen'),
		enableSuggestions: readBoolean(map, 'enableSuggestions'),
	};
}

/**
 * A Sign document's run state comes from `signSettings`, not `questionStatus`:
 *   hidden (admin-only, in review)      → queued
 *   frozen                              → frozen
 *   suggestions disabled (and visible)  → closed
 *   otherwise                           → open (for comment)
 */
export function toDocumentRunState(settings: SignDocumentRunSettings): ActivityRunState {
	if (settings.isHidden === true) return 'queued';
	if (settings.isFrozen === true) return 'frozen';
	if (settings.enableSuggestions === false) return 'closed';

	return 'open';
}

function deriveRunState(
	statement: Statement,
	type: ActivityType,
	def: ActivityTypeDef,
): ActivityRunState {
	if (type === ActivityType.signDocument) {
		return toDocumentRunState(getSignDocumentSettings(statement));
	}

	return def.statusSource === 'questionStatus'
		? toRunState(statement.statementSettings?.questionStatus)
		: 'open';
}

function toActivity(statement: Statement, resolver: ActivityUrlResolver): DerivedActivity {
	const type = getActivityType(statement);
	const def = getActivityDef(type);
	const runState = deriveRunState(statement, type, def);

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
