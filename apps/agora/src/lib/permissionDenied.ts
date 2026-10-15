/**
 * Whether a Firestore read or a callable was refused for lack of permission
 * (`permission-denied`, with or without the SDK's `firestore/` or
 * `functions/` prefix). The one test the screens use to tell "you may not
 * see this" from "something broke, try again".
 */
export function isPermissionDenied(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;

	return (
		typeof code === 'string' && code.replace(/^(firestore|functions)\//, '') === 'permission-denied'
	);
}
