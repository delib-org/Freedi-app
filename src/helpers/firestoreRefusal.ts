const REFUSED_READ_CODES: readonly string[] = ['permission-denied', 'unavailable'];

/**
 * True when a read failed because the person may not see the document or is
 * offline. For a caller that is only asking whether a level is open, both are
 * ordinary answers and not faults to report.
 */
export function isRefusedRead(error: unknown): boolean {
	const code = (error as { code?: unknown } | null | undefined)?.code;

	return typeof code === 'string' && REFUSED_READ_CODES.includes(code);
}
