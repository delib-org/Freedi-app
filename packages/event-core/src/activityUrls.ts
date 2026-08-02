import { ActivityType, SourceApp } from '@freedi/shared-types';

/**
 * Event Control Center — framework-agnostic activity URL resolution.
 *
 * Each consuming app (main, Studio, …) knows its own deployment base URLs, so
 * the resolver is constructed with them rather than reading env directly. This
 * keeps event-core pure and portable while producing exactly the same deep-links
 * the individual per-app URL helpers do.
 */
export interface EventUrlConfig {
	/** Main React app origin, e.g. https://app.wizcol.com */
	mainAppBaseUrl: string;
	/** Mass-consensus app origin, e.g. https://mc.wizcol.com */
	massConsensusBaseUrl: string;
	/** Sign app origin, e.g. https://sign.wizcol.com */
	signBaseUrl: string;
	/**
	 * Join app origin, e.g. https://join.wizcol.com. Optional — consumers that
	 * don't route to the join app (e.g. Studio today) simply omit it, and
	 * join-app route links resolve to null (rendered disabled).
	 */
	joinBaseUrl?: string;
}

export interface ActivityLink {
	/** Absolute URL, safe to share, QR-encode, or open in a new tab. */
	href: string;
	/** True when the link leaves the main app (mass-consensus / sign domains). */
	external: boolean;
}

export interface ActivityUrlResolver {
	getParticipantLink: (type: ActivityType, statementId: string) => ActivityLink | null;
	getAdminLink: (type: ActivityType, statementId: string) => ActivityLink | null;
	/**
	 * Cross-App Statement Router: the URL that opens `statementId` in the
	 * given destination app's lens. Returns null when the destination has no
	 * statement-addressable route or its base URL is not configured.
	 */
	getRouteLink: (sourceApp: SourceApp, statementId: string) => ActivityLink | null;
}

function trimSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

export function createActivityUrlResolver(config: EventUrlConfig): ActivityUrlResolver {
	const main = trimSlash(config.mainAppBaseUrl);
	const mc = trimSlash(config.massConsensusBaseUrl);
	const sign = trimSlash(config.signBaseUrl);
	const join = config.joinBaseUrl ? trimSlash(config.joinBaseUrl) : null;

	const mainStatementUrl = (statementId: string, screen?: string): string =>
		screen
			? `${main}/statement-screen/${statementId}/${screen}`
			: `${main}/statement/${statementId}`;

	const getParticipantLink = (
		type: ActivityType,
		statementId: string,
	): ActivityLink | null => {
		switch (type) {
			case ActivityType.massConsensus:
				return { href: `${mc}/q/${statementId}`, external: true };
			case ActivityType.signDocument:
				return { href: `${sign}/doc/${statementId}`, external: true };
			case ActivityType.multiStage:
			case ActivityType.compound:
			case ActivityType.question:
				return { href: mainStatementUrl(statementId), external: false };
			case ActivityType.unknown:
			default:
				return null;
		}
	};

	const getAdminLink = (type: ActivityType, statementId: string): ActivityLink | null => {
		switch (type) {
			case ActivityType.signDocument:
				return { href: `${sign}/doc/${statementId}/admin`, external: true };
			case ActivityType.massConsensus:
			case ActivityType.multiStage:
			case ActivityType.compound:
			case ActivityType.question:
				return { href: mainStatementUrl(statementId, 'settings'), external: false };
			case ActivityType.unknown:
			default:
				return null;
		}
	};

	const getRouteLink = (sourceApp: SourceApp, statementId: string): ActivityLink | null => {
		switch (sourceApp) {
			case SourceApp.JOIN:
				// Join-app long route: opens a specific question by statementId.
				return join ? { href: `${join}/q/${statementId}`, external: true } : null;
			case SourceApp.MASS_CONSENSUS:
				return { href: `${mc}/q/${statementId}`, external: true };
			case SourceApp.SIGN:
				return { href: `${sign}/doc/${statementId}`, external: true };
			case SourceApp.MAIN:
				return { href: mainStatementUrl(statementId), external: false };
			default:
				return null;
		}
	};

	return { getParticipantLink, getAdminLink, getRouteLink };
}
