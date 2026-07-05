import { ActivityType } from '@freedi/shared-types';
import { getMassConsensusQuestionUrl } from '@/controllers/db/config';
import { getSignDocumentUrl, getSignAdminUrl } from '@/utils/urlHelpers';

/**
 * Event Control Center — activity URL resolution (Phase 1).
 *
 * The pure registry in `@freedi/shared-types` declares WHICH engine an activity
 * maps to; this main-app module resolves the actual deep-links by reusing the
 * existing per-app URL helpers. Kept here (not in shared-types) because the
 * helpers live in the main app and reference its env/config.
 */

export interface ActivityLink {
	/** Absolute URL, safe to share, QR-encode, or open in a new tab. */
	href: string;
	/** True when the link leaves the main app (mass-consensus / sign domains). */
	external: boolean;
}

/** Absolute URL to a statement inside the main app SPA. */
function mainAppStatementUrl(statementId: string, screen?: string): string {
	const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
	if (screen) {
		return `${origin}/statement-screen/${statementId}/${screen}`;
	}

	return `${origin}/statement/${statementId}`;
}

/**
 * Where participants go for this activity. Returns null when the activity type
 * has no participant destination (e.g. `unknown`).
 */
export function getActivityParticipantLink(
	type: ActivityType,
	statementId: string,
): ActivityLink | null {
	switch (type) {
		case ActivityType.massConsensus:
			return { href: getMassConsensusQuestionUrl(statementId), external: true };
		case ActivityType.signDocument:
			return { href: getSignDocumentUrl(statementId), external: true };
		case ActivityType.multiStage:
		case ActivityType.compound:
		case ActivityType.question:
			return { href: mainAppStatementUrl(statementId), external: false };
		case ActivityType.unknown:
		default:
			return null;
	}
}

/**
 * Where a facilitator goes to configure this activity. Falls back to the main
 * app's statement settings screen for main-engine activities.
 */
export function getActivityAdminLink(type: ActivityType, statementId: string): ActivityLink | null {
	switch (type) {
		case ActivityType.signDocument:
			return { href: getSignAdminUrl(statementId), external: true };
		case ActivityType.massConsensus:
		case ActivityType.multiStage:
		case ActivityType.compound:
		case ActivityType.question:
			return { href: mainAppStatementUrl(statementId, 'settings'), external: false };
		case ActivityType.unknown:
		default:
			return null;
	}
}
