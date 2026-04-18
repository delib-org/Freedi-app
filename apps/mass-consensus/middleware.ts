import { NextRequest, NextResponse } from 'next/server';

const SECURE_UID_COOKIE = '_uid';
const LEGACY_UID_COOKIE = 'userId';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const UNSUPPORTED_PATH = '/browser-unsupported.html';

// Minimum versions needed to parse optional chaining / nullish coalescing
// used by Next.js 14 App Router runtime and React DOM.
const MIN_CHROMIUM = 80;
const MIN_FIREFOX = 74;
const MIN_SAFARI_MAJOR = 13;
const MIN_SAFARI_MINOR = 1;

function isUnsupportedBrowser(userAgent: string): boolean {
	if (!userAgent) return false;

	// Chromium-based (Chrome, Edge Chromium, Opera, Samsung, Xiaomi MiuiBrowser, etc.)
	const chromiumMatch = userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
	if (chromiumMatch) {
		const version = parseInt(chromiumMatch[1], 10);

		return version < MIN_CHROMIUM;
	}

	const firefoxMatch = userAgent.match(/Firefox\/(\d+)/);
	if (firefoxMatch) {
		const version = parseInt(firefoxMatch[1], 10);

		return version < MIN_FIREFOX;
	}

	// Safari (no Chromium marker). Version/X.Y reflects Safari version.
	if (/Safari\//.test(userAgent)) {
		const versionMatch = userAgent.match(/Version\/(\d+)\.(\d+)/);
		if (versionMatch) {
			const major = parseInt(versionMatch[1], 10);
			const minor = parseInt(versionMatch[2], 10);
			if (major < MIN_SAFARI_MAJOR) return true;
			if (major === MIN_SAFARI_MAJOR && minor < MIN_SAFARI_MINOR) return true;
		}
	}

	return false;
}

/**
 * Middleware to ensure an HttpOnly secure userId cookie exists.
 * Also intercepts very old browsers (which can't parse the Next.js
 * App Router runtime) and rewrites them to a static info page.
 *
 * - If `_uid` cookie exists, pass through.
 * - If only legacy `userId` exists, copy it to `_uid` as HttpOnly.
 * - If neither exists, generate a new anonymous ID and set both.
 *
 * The `_uid` cookie is HttpOnly (invisible to JS, immune to XSS).
 * The legacy `userId` cookie is kept for backward-compatible client reads.
 */
export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Always let the unsupported page itself through.
	if (pathname === UNSUPPORTED_PATH) {
		return NextResponse.next();
	}

	const userAgent = request.headers.get('user-agent') || '';
	if (isUnsupportedBrowser(userAgent)) {
		return NextResponse.rewrite(new URL(UNSUPPORTED_PATH, request.url));
	}

	const secureUid = request.cookies.get(SECURE_UID_COOKIE)?.value;
	const legacyUid = request.cookies.get(LEGACY_UID_COOKIE)?.value;

	// Already has secure cookie — pass through
	if (secureUid) {
		return NextResponse.next();
	}

	const response = NextResponse.next();

	// Use legacy userId if available, otherwise generate new anonymous ID
	const userId = legacyUid || `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

	const isProduction = process.env.NODE_ENV === 'production';

	// Set HttpOnly secure cookie (server-only, XSS-proof)
	response.cookies.set(SECURE_UID_COOKIE, userId, {
		httpOnly: true,
		secure: isProduction,
		sameSite: 'lax',
		maxAge: COOKIE_MAX_AGE,
		path: '/',
	});

	// Also set legacy cookie if it doesn't exist (for client-side reads)
	if (!legacyUid) {
		response.cookies.set(LEGACY_UID_COOKIE, userId, {
			httpOnly: false,
			secure: isProduction,
			sameSite: 'lax',
			maxAge: COOKIE_MAX_AGE,
			path: '/',
		});
	}

	return response;
}

export const config = {
	// Run on all routes except static files and Next.js internals
	matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
