/** The server's moderator refused this text; `reason` is written to its author. */
export interface ContentRejection {
	reason: string;
	category: string;
}

const HTTP_BAD_REQUEST = 400;
const DEFAULT_CATEGORY = 'other';

/**
 * Reads a moderation refusal out of a failed response, or null for any other
 * failure. A bare 400 is not enough: "Missing required fields" is also a 400
 * and must keep failing open, so only a body carrying `reason` counts.
 */
export function parseContentRejection(status: number, body: unknown): ContentRejection | null {
	if (status !== HTTP_BAD_REQUEST || typeof body !== 'object' || body === null) return null;

	const { reason, category } = body as { reason?: unknown; category?: unknown };
	if (typeof reason !== 'string' || !reason.trim()) return null;

	return { reason, category: typeof category === 'string' ? category : DEFAULT_CATEGORY };
}
