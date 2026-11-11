/**
 * Concrete paths of the routes in routes.ts (IA section 7). Screens build
 * links with these so a path is written in one place.
 */

export function hostListPath(): string {
	return '/host';
}

export function hostHomePath(sessionId: string): string {
	return `/host/sessions/${encodeURIComponent(sessionId)}`;
}

export function hostNewPath(): string {
	return '/host/new';
}

export type HostSubScreen = 'participants' | 'preview' | 'assignment' | 'screen';

export function hostScreenPath(sessionId: string, screen: HostSubScreen): string {
	return `${hostHomePath(sessionId)}/${screen}`;
}

export function participantHomePath(sessionId: string): string {
	return `/sessions/${encodeURIComponent(sessionId)}`;
}

export type ParticipantSubScreen = 'name' | 'preferences' | 'position' | 'my-table';

export function participantScreenPath(sessionId: string, screen: ParticipantSubScreen): string {
	return `${participantHomePath(sessionId)}/${screen}`;
}
