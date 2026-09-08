/**
 * "Is this code running on a developer's machine?"
 *
 * Every app already gated Sentry on a BUILD flag — `import.meta.env.PROD` for
 * the Vite apps, `NODE_ENV === 'production'` for the Next ones. A build flag
 * answers "was this bundle built for production", which is not the same
 * question and misses every local run of a production build: `vite preview`,
 * `next start`, the chat SSR bundle running inside the functions emulator, and
 * Cloud Functions in the emulator (whose functions/.env carries the real DSN so
 * that deploys have one). All of those filed `environment: development` issues
 * into the production Sentry project.
 *
 * This asks the RUNTIME instead, and only on signals that cannot be true of a
 * real deployment:
 *
 *  - a browser served from loopback or an mDNS `.local` name;
 *  - a Firebase emulator announcing itself through the environment;
 *  - `NODE_ENV` explicitly saying development or test;
 *  - a Node process with no deployment marker at all — every Freedi server
 *    target sets one (`K_SERVICE`/`FUNCTION_TARGET` on Cloud Run and Cloud
 *    Functions, `VERCEL` on Vercel), so their absence means nobody deployed
 *    this.
 *
 * The failure this is designed against is the noisy one (local errors reaching
 * production Sentry), not the silent one (production going unreported), so the
 * last signal is the only inferential one and `SENTRY_ENABLE_IN_LOCAL=true` /
 * `VITE_SENTRY_ENABLE_IN_LOCAL=true` overrides the whole check when you need to
 * exercise this wiring from a laptop.
 *
 * Dependency-free and safe in both runtimes: `process` and `location` are each
 * reached through `globalThis` behind a typeof guard, so neither side throws
 * where the other's global does not exist.
 */

/** Hostnames that only ever mean "this machine". */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', '']);

/** Emulator variables. Any one of these means a Firebase emulator is in play. */
const EMULATOR_ENV_VARS = [
	'FUNCTIONS_EMULATOR',
	'FIRESTORE_EMULATOR_HOST',
	'FIREBASE_AUTH_EMULATOR_HOST',
	'FIREBASE_DATABASE_EMULATOR_HOST',
	'FIREBASE_STORAGE_EMULATOR_HOST',
	'FIREBASE_EMULATOR_HUB',
	'PUBSUB_EMULATOR_HOST',
] as const;

/** Set by every platform Freedi deploys a server to. */
const DEPLOYMENT_MARKERS = ['K_SERVICE', 'FUNCTION_TARGET', 'FUNCTION_NAME', 'VERCEL'] as const;

function env(): Record<string, string | undefined> | null {
	const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;

	return proc?.env ?? null;
}

function hostname(): string | null {
	const loc = (globalThis as { location?: { hostname?: string } }).location;

	return typeof loc?.hostname === 'string' ? loc.hostname : null;
}

/** True when the developer has explicitly asked for reporting from a local run. */
function overridden(): boolean {
	const vars = env();
	if (vars?.SENTRY_ENABLE_IN_LOCAL === 'true') return true;
	if (vars?.VITE_SENTRY_ENABLE_IN_LOCAL === 'true') return true;

	// Vite inlines import.meta.env into the bundle, so a browser build has no
	// process.env to read the override from. The apps that want it pass it in.
	return false;
}

/**
 * True when this process/page is running on a developer machine rather than a
 * deployed environment. Callers use it to suppress error reporting.
 *
 * @param explicitOverride let an app forward its own build-time flag (a Vite
 * app reads `import.meta.env.VITE_SENTRY_ENABLE_IN_LOCAL`, which is inlined and
 * therefore invisible to this module).
 */
export function isLocalRuntime(explicitOverride = false): boolean {
	if (explicitOverride || overridden()) return false;

	const host = hostname();
	if (host !== null) {
		// A browser: the address bar is the whole truth, and it cannot lie the
		// way a build flag can.
		return LOCAL_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.localhost');
	}

	const vars = env();
	if (!vars) return false;

	if (EMULATOR_ENV_VARS.some((name) => Boolean(vars[name]))) return true;
	if (vars.NODE_ENV === 'development' || vars.NODE_ENV === 'test') return true;

	return !DEPLOYMENT_MARKERS.some((name) => Boolean(vars[name]));
}
