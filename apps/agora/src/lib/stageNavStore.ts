import { serializeStageNav, type StageNavState } from './flows/stageNav';

/**
 * Where this person is standing in the lesson, remembered per tab.
 *
 * The room's position lives on the session doc; the player's own choice of
 * station (a step back to catch up, a look at an earlier board) is theirs
 * alone, and a refresh should land them where they were. sessionStorage, not
 * the participant doc: it is a "where was I" mark, not a fact about the
 * deliberation, and the teacher's class view — which has no participant doc
 * at all — keeps one just the same.
 */
export function navKey(sessionId: string): string {
	return `agora_${sessionId}_viewing`;
}

export function readStoredNav(sessionId: string): string | null {
	try {
		return sessionStorage.getItem(navKey(sessionId));
	} catch {
		return null;
	}
}

export function storeNav(sessionId: string, state: StageNavState): void {
	try {
		sessionStorage.setItem(navKey(sessionId), serializeStageNav(state));
	} catch {
		// Storage refused: a refresh lands on the current stage, which is fine.
	}
}
