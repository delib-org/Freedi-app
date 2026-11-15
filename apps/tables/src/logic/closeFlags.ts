/**
 * The topics the server reported with one person when the host closed a "sit
 * where you like" session. Closing moves the host to another screen, so the
 * answer is kept here, by session, for that screen to show.
 */
const flagsBySession = new Map<string, readonly string[]>();

export function rememberCloseFlags(sessionId: string, topicIds: readonly string[]): void {
	if (topicIds.length === 0) {
		flagsBySession.delete(sessionId);

		return;
	}
	flagsBySession.set(sessionId, topicIds);
}

export function closeFlagsOf(sessionId: string): readonly string[] {
	return flagsBySession.get(sessionId) ?? [];
}
