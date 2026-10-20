/**
 * What to tell a player whose Google sign-in did not finish.
 *
 * `silent`: the player closed the popup themselves (or a second click replaced
 * the first) - nothing went wrong, so nothing is shown.
 * `failed`: anything else - blocked popup, unsupported storage, network, or an
 * error we have not seen. The player is stranded unless we say what to do.
 */
export type SignInFailure = 'silent' | 'failed';

const SILENT_CODES: readonly string[] = [
	'auth/popup-closed-by-user',
	'auth/cancelled-popup-request',
];

/** Firebase errors carry a string `code`; anything else has none. */
export function getErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const { code } = error as { code: unknown };

		return typeof code === 'string' ? code : undefined;
	}

	return undefined;
}

export function classifySignInError(error: unknown): SignInFailure {
	const code = getErrorCode(error);

	return code !== undefined && SILENT_CODES.includes(code) ? 'silent' : 'failed';
}

/** WhatsApp, Instagram, Facebook, Messenger, Line, TikTok and generic Android WebViews. */
const IN_APP_BROWSER = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|TikTok|; wv\)/i;

/** An iOS WebView (WhatsApp's among them) has no "Safari/" token; Safari and Chrome for iOS do. */
function isIosWebView(userAgent: string): boolean {
	return /iPhone|iPad|iPod/.test(userAgent) && !/Safari\//.test(userAgent);
}

export function isInAppBrowser(userAgent: string): boolean {
	return IN_APP_BROWSER.test(userAgent) || isIosWebView(userAgent);
}
