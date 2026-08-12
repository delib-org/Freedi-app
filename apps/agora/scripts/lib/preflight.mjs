/**
 * Preflight — assert the local Agora dev stack is actually usable BEFORE a
 * script starts driving it.
 *
 * Every e2e/screenshot script here depends on four moving parts (Firestore
 * emulator, auth emulator, functions emulator, vite) plus seeded data, and
 * when one of them is missing the failure surfaces minutes later as something
 * unreadable — the classic being `TypeError: Cannot destructure property
 * 'sessionId'` sixty seconds into a run, which actually means "the topic
 * package was never seeded". This module turns every one of those into an
 * immediate sentence that says what is wrong and what to type.
 *
 * Usage (top of any script):
 *   import { preflight } from './lib/preflight.mjs';
 *   await preflight();                       // everything, auto-seeds
 *   await preflight({ needs: ['firestore'] });
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/agora — the worktree this script belongs to */
export const APP_ROOT = resolve(HERE, '../..');

export const PROJECT_ID = process.env.AGORA_PROJECT_ID ?? 'freedi-test';
export const REGION = process.env.AGORA_REGION ?? 'me-west1';
export const AUTH_HOST = process.env.AGORA_AUTH_HOST ?? 'http://localhost:9099';
export const FIRESTORE_HOST = process.env.AGORA_FIRESTORE_HOST ?? 'http://localhost:8081';
export const FUNCTIONS_HOST = process.env.AGORA_FUNCTIONS_HOST ?? 'http://localhost:5001';
export const VITE_HOST = process.env.AGORA_VITE_HOST ?? 'http://localhost:3009';

export const FIRESTORE_REST = `${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export const FUNCTIONS_BASE = `${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}`;
export const TOPIC_PACKAGE_ID = 'demo-french-revolution';

class PreflightError extends Error {
	constructor(what, fix) {
		super(`${what}\n         → fix: ${fix}`);
		this.name = 'PreflightError';
	}
}

const say = (quiet, msg) => {
	if (!quiet) console.log(msg);
};

/**
 * A dead port and a wedged server need opposite fixes, so never collapse them
 * into "not answering". Refused = nothing is listening (start it). Timed out =
 * something IS listening but never replies — which is how the Firestore
 * emulator fails after a long run, and it will happily hang every call for a
 * full minute before anything downstream notices.
 */
async function get(url, timeoutMs = 5000, headers = undefined) {
	try {
		return await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		const wedged = error.name === 'TimeoutError' || error.cause?.name === 'TimeoutError';

		return { ok: false, status: 0, offline: true, wedged, error };
	}
}

/** The two ways a port can be unusable, each with its own fix. */
function unreachable(res, label, host, startFix) {
	return res.wedged
		? new PreflightError(
				`${label} is listening on ${host} but never answered — wedged (the emulators here have been up a long time)`,
				'restart the emulators: kill the emulators:start process, then npm run emulators from the repo root',
			)
		: new PreflightError(`${label} is not running on ${host}`, startFix);
}

/** Firestore emulator up, and the demo topic package present (auto-seeds). */
async function checkFirestore(quiet, autoSeed) {
	// `Bearer owner` is the emulator's admin escape hatch — without it this read
	// is judged by the production security rules and comes back 403, which says
	// nothing about whether the data is there.
	const res = await get(`${FIRESTORE_REST}/agoraTopicPackages/${TOPIC_PACKAGE_ID}`, 5000, {
		Authorization: 'Bearer owner',
	});
	if (res.offline) {
		throw unreachable(
			res,
			'Firestore emulator',
			FIRESTORE_HOST,
			'npm run emulators (from the repo root) — and run it from ONE worktree only',
		);
	}

	// 404 = emulator is up but this database has no seeded topic package. That
	// is the single most common cause of a mid-run explosion, so heal it here
	// rather than letting a callable return undefined three minutes from now.
	if (res.status === 404) {
		if (!autoSeed) {
			throw new PreflightError(
				`Topic package "${TOPIC_PACKAGE_ID}" is missing from the emulator`,
				'npm run seed',
			);
		}
		say(quiet, '   … topic package missing — seeding now');
		try {
			execFileSync('npx', ['tsx', 'scripts/seed.ts'], { cwd: APP_ROOT, stdio: 'pipe' });
		} catch (error) {
			throw new PreflightError(
				`Auto-seed failed: ${error.stderr?.toString().trim() || error.message}`,
				'npm run seed (and read the error)',
			);
		}
		say(quiet, '   ✓ seeded');

		return 'seeded';
	}

	if (!res.ok) {
		throw new PreflightError(
			`Firestore emulator answered ${res.status} for the topic package read`,
			'check the emulator log — the Firestore emulator may be starting up',
		);
	}

	return 'ok';
}

async function checkAuth() {
	const res = await get(`${AUTH_HOST}/`);
	if (res.offline) {
		throw unreachable(
			res,
			'Auth emulator',
			AUTH_HOST,
			'npm run emulators (from the repo root)',
		);
	}
}

/**
 * The functions emulator is up AND the agora callables are actually loaded in
 * it. A functions emulator running a build that predates the agora functions
 * answers 404 for every agora call — indistinguishable, from the caller's
 * side, from a typo in the function name.
 *
 * The probe is an unauthenticated `agoraAdvanceStage`: a loaded function
 * rejects it with `unauthenticated`, which is the success signal here.
 * Generous timeout — the emulator cold-starts the whole functions bundle on
 * the first call and that can take the better part of a minute.
 */
async function checkFunctions(quiet) {
	let res;
	try {
		res = await fetch(`${FUNCTIONS_BASE}/agoraAdvanceStage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ data: {} }),
			signal: AbortSignal.timeout(120_000),
		});
	} catch (error) {
		throw new PreflightError(
			`Functions emulator not answering on ${FUNCTIONS_HOST} (${error.message})`,
			'npm run emulators (from the repo root)',
		);
	}

	if (res.status === 404) {
		throw new PreflightError(
			'Functions emulator is up but has no `agoraAdvanceStage` — it is running a build without the agora functions',
			'restart the emulators from a worktree whose functions/src/index.ts exports the agora functions',
		);
	}

	const body = await res.text();
	if (!body.toLowerCase().includes('unauthenticated')) {
		say(quiet, `   ! functions probe returned an unexpected body: ${body.slice(0, 120)}`);
	}
}

/**
 * Vite is up on 3009 AND it is serving THIS worktree.
 *
 * A vite left running in another worktree answers on the same port and looks
 * completely healthy, so edits appear to have no effect — the most expensive
 * false signal in this repo. `/@fs/<abs path>` is the discriminator: vite only
 * serves files inside its own project root, so a foreign server replies 403
 * for a path in this worktree.
 */
async function checkVite() {
	const root = await get(`${VITE_HOST}/`);
	if (root.offline) {
		throw unreachable(root, 'Vite', VITE_HOST, 'cd apps/agora && npm run dev');
	}

	const probe = await get(`${VITE_HOST}/@fs${APP_ROOT}/src/index.ts`);
	if (probe.status === 403) {
		throw new PreflightError(
			`Something else is serving ${VITE_HOST} — it refuses to serve ${APP_ROOT} (a vite from another worktree)`,
			`stop that server (lsof -nP -iTCP:3009 -sTCP:LISTEN) then run npm run dev from ${APP_ROOT}`,
		);
	}
	if (!probe.ok) {
		throw new PreflightError(
			`Vite answered ${probe.status} for this worktree's entry module`,
			'restart the dev server and check its console for a transform error',
		);
	}
}

const CHECKS = {
	firestore: checkFirestore,
	auth: checkAuth,
	functions: checkFunctions,
	vite: checkVite,
};

/**
 * Run the checks a script depends on. Throws with an actionable message on the
 * first failure; resolves silently (bar one summary line) when the stack is
 * ready.
 */
export async function preflight({
	needs = ['firestore', 'auth', 'functions', 'vite'],
	autoSeed = true,
	quiet = false,
} = {}) {
	say(quiet, `\n=== PREFLIGHT (${needs.join(', ')})`);
	const started = Date.now();

	for (const need of needs) {
		const check = CHECKS[need];
		if (!check) throw new Error(`preflight: unknown check "${need}"`);
		await check(quiet, autoSeed);
	}

	say(quiet, `   ✓ stack ready in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

// Runnable on its own: `npx tsx scripts/lib/preflight.mjs` / node …
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	preflight().catch((error) => {
		console.error(`\n✗ PREFLIGHT: ${error.message}\n`);
		process.exit(1);
	});
}
