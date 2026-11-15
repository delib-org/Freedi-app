/** Where the standalone Tables app lives. Other apps open it with a link. */
export const TABLES_BASE_URL = 'https://tables.wizcol.com';

function trimTrailingSlashes(url: string): string {
	return url.replace(/\/+$/, '');
}

/** Participant link of one table assignment: `<base>/sessions/<id>`. */
export function tablesSessionUrl(baseUrl: string, sessionId: string): string {
	return `${trimTrailingSlashes(baseUrl)}/sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Host link: the host's list (`<base>/host`), or one session's home
 * (`<base>/host/sessions/<id>`) when a session id is given.
 */
export function tablesHostUrl(baseUrl: string, sessionId?: string): string {
	const host = `${trimTrailingSlashes(baseUrl)}/host`;

	return sessionId ? `${host}/sessions/${encodeURIComponent(sessionId)}` : host;
}

/** Where the Class app lives: the personal link opens there. */
export const CLASS_BASE_URL = 'https://class.wizcol.com';

/**
 * The personal link into a connected lesson (IA tables-class-bridge 5.1):
 * `<base>/seat/<seatCode>`. The code comes from `tablesSeatLink`; the URL
 * carries nothing else (no name, no session id, no lesson id).
 */
export function classSeatUrl(baseUrl: string, seatCode: string): string {
	return `${trimTrailingSlashes(baseUrl)}/seat/${encodeURIComponent(seatCode)}`;
}
