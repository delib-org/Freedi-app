/**
 * Detects transient/expected service worker registration failures that should
 * NOT be reported to Sentry:
 * - Network failures fetching the SW script (offline, flaky connection)
 * - AbortError "Rejected": Chromium aborts the registration job when the page
 *   unloads mid-registration or when another script unregisters service
 *   workers concurrently (e.g. chunk-error recovery)
 */
export function isTransientSwRegistrationError(error: unknown): boolean {
	if (error instanceof DOMException && error.name === 'AbortError') {
		return true;
	}

	const message = error instanceof Error ? error.message : '';

	return (
		message === 'Rejected' ||
		message.includes('fetching the script') ||
		message.includes('Failed to fetch') ||
		message.includes('network')
	);
}
