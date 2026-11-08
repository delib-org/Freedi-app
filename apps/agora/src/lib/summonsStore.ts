/**
 * The newest teacher's call this device already answered, per session.
 *
 * sessionStorage, like the viewing position (`stageNavStore`): a reload
 * must not walk the student a second time, and a call this tab never saw
 * must still be honoured when it resumes — both follow from remembering
 * one number here rather than judging a call by its age.
 */
export function summonsKey(sessionId: string): string {
	return `agora_${sessionId}_call`;
}

export function readHandledCall(sessionId: string): number | undefined {
	try {
		const raw = sessionStorage.getItem(summonsKey(sessionId));
		const at = raw === null ? NaN : Number(raw);

		return Number.isFinite(at) ? at : undefined;
	} catch {
		return undefined;
	}
}

export function storeHandledCall(sessionId: string, at: number): void {
	try {
		sessionStorage.setItem(summonsKey(sessionId), String(at));
	} catch {
		// Storage refused: the in-memory stamp still guards this sitting.
	}
}
