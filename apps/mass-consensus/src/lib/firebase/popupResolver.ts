import { browserPopupRedirectResolver, type Auth, type PopupRedirectResolver } from 'firebase/auth';

/**
 * The popup resolver every signInWithPopup() call in the main app passes, and
 * a way to warm it off the critical path.
 *
 * Auth is created WITHOUT a default resolver (see config.ts): the default one
 * makes Auth load Google's gapi iframe (iframe.js ~93 KB + /__/auth/iframe) and,
 * on mobile and Safari, wait for it before it even reads the saved user.
 *
 * The iframe still has to be ready BEFORE a tap: signInWithPopup() awaits
 * `resolver._initialize(auth)` before `window.open`, and iOS Safari blocks a
 * popup opened that late. Firebase keeps one resolver instance per class in an
 * internal cache, and there is no public API that initializes it -
 * getRedirectResult() returns early when no redirect is pending - so warming a
 * `new browserPopupRedirectResolver()` would warm a different instance than
 * the one the tap uses.
 *
 * So this module owns the instance: `popupResolver` is a constructor that
 * always returns the same object (with the real prototype, so Firebase's
 * instance checks hold), and `warmPopupResolver()` initializes that object.
 * If Firebase's internals ever change, the warm-up silently does nothing and
 * sign-in behaves like the SDK default (iframe loads on the first tap).
 */
type ResolverInternal = { _initialize?: (auth: Auth) => Promise<unknown> };
type ResolverClass = new () => ResolverInternal;

const BrowserResolver = browserPopupRedirectResolver as unknown as ResolverClass;
let sharedInstance: ResolverInternal | null = null;

function sharedResolver(): ResolverInternal {
	if (!sharedInstance) sharedInstance = new BrowserResolver();

	return sharedInstance;
}

function SharedPopupResolver(): ResolverInternal {
	return sharedResolver();
}
// Optional chaining only for test doubles of 'firebase/auth' that omit it.
SharedPopupResolver.prototype = BrowserResolver?.prototype;

export const popupResolver = SharedPopupResolver as unknown as PopupRedirectResolver;

let warming: Promise<unknown> | null = null;

/** Loads the popup iframe for `auth` once. Safe to call repeatedly. */
export function warmPopupResolver(auth: Auth): Promise<unknown> {
	if (!warming) {
		const resolver = sharedResolver();
		warming =
			typeof resolver._initialize === 'function'
				? resolver._initialize(auth).catch(() => undefined)
				: Promise.resolve();
	}

	return warming;
}
