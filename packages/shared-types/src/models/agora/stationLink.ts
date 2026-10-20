import { object, string, number, optional, picklist, InferOutput } from 'valibot';

/**
 * Linked stations — a step of the lesson whose task lives in another WizCol
 * app (docs/ia/agora-linked-app-stations.md). The plan item carries a `link`
 * to an existing QUESTION Statement; the student opens it signed in as the
 * same uid (a one-time code redeemed for a custom token) and comes back to
 * the same station. Everything here is pure: the server and the three
 * clients build and read the same URLs from the same functions.
 */

/** Which app a linked station opens. `join` is reserved for Phase 2. */
export const AgoraLinkedAppSchema = picklist(['main', 'join']);

export type AgoraLinkedApp = InferOutput<typeof AgoraLinkedAppSchema>;

/** The apps a teacher may link today — the handoff gate exists only there */
export const AGORA_LINKABLE_APPS: readonly AgoraLinkedApp[] = ['main'];

export const AgoraStationLinkSchema = object({
	app: AgoraLinkedAppSchema,
	/** The linked question, owned outside the session's tree — never `item.statementId` */
	statementId: string(),
	/** The question's words when it was linked: shown on the card, never trusted for access */
	title: string(),
	linkedAt: number(),
});

export type AgoraStationLink = InferOutput<typeof AgoraStationLinkSchema>;

/** `AgoraParticipant.stationVisits[itemId]` — a courtesy signal, never a gate */
export const AgoraStationVisitSchema = object({
	openedAt: number(),
	returnedAt: optional(number()),
});

export type AgoraStationVisit = InferOutput<typeof AgoraStationVisitSchema>;

export const AGORA_STATION_LINK = {
	/** A minted code lives five minutes; the station refreshes it at half that */
	HANDOFF_TTL_MS: 5 * 60 * 1000,
	/** Longest code the redeem callable reads (a minted one is 43 characters) */
	CODE_CHARS: 100,
	/** Longest pasted link the check reads */
	MAX_URL_CHARS: 2048,
	/** Same as AGORA_STAGE_PLAN.MAX_TITLE_LENGTH (not imported: stagePlan imports this file) */
	MAX_TITLE: 200,
	/** The fragment key, shared with the main→Sign handoff */
	FRAGMENT_KEY: 'freedi-handoff',
	/** The postMessage type the other app sends its opener on "Back to the village" */
	RETURN_MESSAGE: 'agora-station-return',
	/** The developer claim on the guest's ID token */
	GUEST_CLAIM: 'agora',
} as const;

/** Hosts a pasted link may point at, per app */
export type StationLinkHosts = Readonly<Record<AgoraLinkedApp, readonly string[]>>;

export const STATION_LINK_HOSTS: StationLinkHosts = {
	main: [
		'app.wizcol.com',
		'wizcol-app.web.app',
		'wizcol-app.firebaseapp.com',
		'freedi-test.web.app',
		'freedi-test.firebaseapp.com',
	],
	join: ['join.wizcol.com', 'wizcol-join.web.app', 'wizcol-join.firebaseapp.com'],
};

export type StationLinkError = 'bad_link' | 'not_found' | 'not_admin' | 'not_question';

export const STATION_LINK_ERRORS: readonly StationLinkError[] = [
	'bad_link',
	'not_found',
	'not_admin',
	'not_question',
];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAIN_PATHS = [/^\/statement\/([^/]+)/, /^\/statement-screen\/([^/]+)/, /^\/stage\/([^/]+)/];
const JOIN_PATHS = [/^\/m\/[^/]+\/q\/([^/]+)/, /^\/q\/([^/]+)/];

function idFrom(pathname: string, patterns: readonly RegExp[]): string | null {
	for (const pattern of patterns) {
		const match = pattern.exec(pathname);
		if (match && ID_PATTERN.test(match[1])) return match[1];
	}

	return null;
}

function isLocalHost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * The question a pasted link points at, or null. The host must be on the
 * app's allow-list (localhost only when `allowLocalhost`, decided by the
 * path); the id must look like a document id. Never trusted for access —
 * the server loads the statement and checks the teacher administers it.
 */
export function parseStationLink(
	raw: string,
	options: { hosts?: StationLinkHosts; allowLocalhost?: boolean } = {},
): { app: AgoraLinkedApp; statementId: string } | null {
	const hosts = options.hosts ?? STATION_LINK_HOSTS;
	const text = (raw ?? '').trim();
	if (!text || text.length > AGORA_STATION_LINK.MAX_URL_CHARS) return null;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	const local = isLocalHost(url.hostname) && options.allowLocalhost === true;
	if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;

	const mainId = idFrom(url.pathname, MAIN_PATHS);
	const joinId = idFrom(url.pathname, JOIN_PATHS);
	if (mainId && (local || hosts.main.includes(url.hostname))) {
		return { app: 'main', statementId: mainId };
	}
	if (joinId && (local || hosts.join.includes(url.hostname))) {
		return { app: 'join', statementId: joinId };
	}

	return null;
}

/** Where "Back to the village" lands, relative to the Agora origin */
export function stationReturnPath(sessionId: string, itemId: string): string {
	return `/#!/play/${encodeURIComponent(sessionId)}?at=${encodeURIComponent(`booth:${itemId}`)}&back=1`;
}

/** The whole return URL: a constant origin plus ids — never a URL from a request */
export function stationReturnUrl(agoraOrigin: string, sessionId: string, itemId: string): string {
	return `${agoraOrigin.replace(/\/+$/, '')}${stationReturnPath(sessionId, itemId)}`;
}

/** The app's own page for the question, with no handoff (the teacher's "Open the question") */
export function stationAppUrl(app: AgoraLinkedApp, origin: string, statementId: string): string {
	const base = origin.replace(/\/+$/, '');

	return app === 'join' ? `${base}/q/${statementId}` : `${base}/statement/${statementId}`;
}

/**
 * The deep link the server builds at mint time. The code rides in the
 * fragment — it never reaches a server log or a Referer — with `via=open`
 * (the gate may close the tab it was opened in) and the `as` hint, so an
 * expired code can still offer the way back.
 */
export function stationDeepLink(input: {
	app: AgoraLinkedApp;
	origin: string;
	statementId: string;
	code: string;
	sessionId: string;
	itemId: string;
}): string {
	const params = new URLSearchParams();
	params.set(AGORA_STATION_LINK.FRAGMENT_KEY, input.code);
	params.set('via', 'open');
	params.set('as', `${input.sessionId}~${input.itemId}`);

	return `${stationAppUrl(input.app, input.origin, input.statementId)}#${params.toString()}`;
}

export interface StationHandoffFragment {
	code: string;
	/** The tab was opened by the station (window.open) — it may close itself */
	opened: boolean;
	/** The `as` hint — only for the way back after an expired code, never for access */
	sessionId?: string;
	itemId?: string;
}

/** Read the handoff fragment (with or without the leading '#'), or null */
export function parseHandoffFragment(hash: string): StationHandoffFragment | null {
	const params = new URLSearchParams((hash ?? '').replace(/^#/, ''));
	const code = params.get(AGORA_STATION_LINK.FRAGMENT_KEY);
	if (!code || code.length > AGORA_STATION_LINK.CODE_CHARS) return null;
	const fragment: StationHandoffFragment = { code, opened: params.get('via') === 'open' };
	const hint = params.get('as') ?? '';
	const [sessionId, itemId] = hint.split('~');
	if (sessionId && itemId && ID_PATTERN.test(sessionId) && ID_PATTERN.test(itemId)) {
		fragment.sessionId = sessionId;
		fragment.itemId = itemId;
	}

	return fragment;
}

/** The guest's ID-token claim: session, item, linked question */
export interface AgoraGuestClaim {
	s: string;
	i: string;
	q: string;
}

/** The claim, when a token's claims carry a well-formed one */
export function agoraGuestClaimOf(
	claims: Readonly<Record<string, unknown>>,
): AgoraGuestClaim | null {
	const raw = claims[AGORA_STATION_LINK.GUEST_CLAIM];
	if (!raw || typeof raw !== 'object') return null;
	const { s, i, q } = raw as Record<string, unknown>;
	if (typeof s !== 'string' || typeof i !== 'string' || typeof q !== 'string') return null;
	if (!ID_PATTERN.test(s) || !ID_PATTERN.test(i) || !ID_PATTERN.test(q)) return null;

	return { s, i, q };
}

export type StationVisitState = 'none' | 'opened' | 'back';

/** Opened and not back since — a second open after a return is "opened" again */
export function stationVisitState(visit: AgoraStationVisit | undefined): StationVisitState {
	if (!visit) return 'none';
	if (visit.returnedAt !== undefined && visit.returnedAt >= visit.openedAt) return 'back';

	return 'opened';
}

/** How many of the class opened the task, and how many came back */
export function stationVisitCounts(visits: ReadonlyArray<AgoraStationVisit | undefined>): {
	opened: number;
	back: number;
} {
	let opened = 0;
	let back = 0;
	visits.forEach((visit) => {
		const state = stationVisitState(visit);
		if (state === 'none') return;
		opened += 1;
		if (state === 'back') back += 1;
	});

	return { opened, back };
}

/* Callables */

export interface CheckStationLinkRequest {
	url: string;
}

export interface CheckStationLinkResponse {
	app: AgoraLinkedApp;
	statementId: string;
	title: string;
}

export interface MintStationHandoffRequest {
	sessionId: string;
	itemId: string;
}

export interface MintStationHandoffResponse {
	url: string;
	expiresAt: number;
}

export interface RedeemAppHandoffRequest {
	code: string;
	app: AgoraLinkedApp;
}

export interface RedeemAppHandoffResponse {
	token: string;
	displayName: string;
	sessionId: string;
	itemId: string;
	statementId: string;
}
