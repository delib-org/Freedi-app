// The side step's dilemma, end to end on phone sizes: the teacher writes the
// question, the two names and the two claims in the plan screen; the student
// phone and the projector show them; an empty question falls back to the default.
// Against the emulators (auth + firestore), with the app on JOIN_CLASS_URL.
// Ports: see e2e-env.mjs. Screenshots go to E2E_SHOTS (default: no screenshots).
//
//   E2E_AUTH_PORT=<auth> E2E_FIRESTORE_PORT=<firestore> JOIN_CLASS_URL=<app> \
//     E2E_SHOTS=/some/dir node scripts/e2e-side-dilemma.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const TIMEOUT = 15000;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const SHOTS = process.env.E2E_SHOTS;

const QUESTION = 'האם רוני חייבת להזמין את דור למסיבה?';
const NAME_A = 'דור';
const NAME_B = 'רוני';
const CLAIM_A = 'רוני חייבת להזמין את דור. כשכל הכיתה מוזמנת, להשאיר ילד אחד בחוץ זה חרם.';
const CLAIM_B =
	'מותר לרוני לא להזמין את דור. זה יום ההולדת שלה, היא נפגעה, וזה לא תפקידה לשלם על ההתנהגות שלו.';

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

async function shot(page, name) {
	if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** No sideways scroll on the page. */
function fitsWidth(page) {
	return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

async function until(fn, ms = TIMEOUT) {
	const end = Date.now() + ms;
	for (;;) {
		const value = await fn();
		if (value) return value;
		if (Date.now() > end) return null;
		await new Promise((r) => setTimeout(r, 200));
	}
}

// ---- seed: a lesson on the Side step --------------------------------------------
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=2', '--students=4', '--tokens'],
	{ cwd: repoRoot, env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId } = seed;
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
const settings = async () =>
	(await db.doc(`statements/${mainId}`).get()).data()?.statementSettings ?? {};

const browser = await chromium.launch();
const pageErrors = [];

try {
	// 1. teacher, phone: fill the dilemma in "lesson details"
	const teacherCtx = await browser.newContext({
		viewport: { width: 390, height: 844 },
		locale: 'he-IL',
	});
	const teacher = await teacherCtx.newPage();
	teacher.on('pageerror', (e) => pageErrors.push(`teacher: ${e.message}`));
	await signInTeacher(teacher, BASE, seed.teacher.uid);
	await teacher.goto(`${BASE}/t/${mainId}/plan`, { waitUntil: 'domcontentloaded' });
	const sides = teacher.locator('.plan-details__sides');
	await sides.waitFor({ timeout: TIMEOUT });
	const inputs = sides.locator('input, textarea');
	check('plan shows question + 2 names + 2 claims', (await inputs.count()) === 5);
	for (const [i, value] of [QUESTION, NAME_A, CLAIM_A, NAME_B, CLAIM_B].entries()) {
		await inputs.nth(i).fill(value);
		await inputs.nth(i).blur();
	}
	const saved = await until(async () => {
		const s = await settings();

		return s.sideQuestion === QUESTION && s.sideClaims?.b === CLAIM_B && s.sideNames?.b === NAME_B
			? s
			: null;
	});
	check(
		'the dilemma is saved on the lesson',
		Boolean(saved),
		JSON.stringify(saved?.sideClaims ?? {}),
	);
	check(
		'claim A saved with name A',
		saved?.sideClaims?.a === CLAIM_A && saved?.sideNames?.a === NAME_A,
	);
	check('plan fits a 390 px phone', await fitsWidth(teacher));
	const claimBox = sides.locator('textarea').nth(1);
	check(
		'the whole claim is visible (no hidden overflow)',
		await claimBox.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
	);
	await sides.scrollIntoViewIfNeeded();
	if (SHOTS)
		await teacher
			.locator('.plan-details')
			.screenshot({ path: join(SHOTS, 'plan-details-390.png') });

	// 2. student phones: the slider carries the question and both claims
	for (const width of [360, 390]) {
		for (const scheme of ['light', 'dark']) {
			const ctx = await browser.newContext({
				viewport: { width, height: 800 },
				locale: 'he-IL',
				colorScheme: scheme,
			});
			const page = await ctx.newPage();
			page.on('pageerror', (e) => pageErrors.push(`student ${width} ${scheme}: ${e.message}`));
			await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
			await page.evaluate(async (token) => {
				const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
				const { auth } = await import('/src/lib/firebase.ts');
				await authMod.signInWithCustomToken(auth, token);
			}, seed.students[0].customToken);
			await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
			await page.locator('.side-slider').waitFor({ timeout: TIMEOUT });
			const body = await page.locator('body').innerText();
			const tag = `${width} ${scheme}`;
			check(`student ${tag}: the teacher's question`, body.includes(QUESTION));
			const claims = await page.locator('.side-slider__claim').allInnerTexts();
			check(`student ${tag}: both claims`, claims[0] === CLAIM_A && claims[1] === CLAIM_B);
			check(`student ${tag}: no sideways scroll`, await fitsWidth(page));
			// the slider still works: drag towards side A, the word follows
			await page.locator('[data-testid="side-slider"]').fill('10');
			const word = await page.locator('.side-slider__word').innerText();
			check(`student ${tag}: the word names side A`, word.includes(NAME_A), word);
			await shot(page, `student-${width}-${scheme}`);
			await ctx.close();
		}
	}

	// 3. projector: question and claims, large
	const proj = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		locale: 'he-IL',
	});
	const screen = await proj.newPage();
	screen.on('pageerror', (e) => pageErrors.push(`projector: ${e.message}`));
	await signInTeacher(screen, BASE, seed.teacher.uid);
	await screen.goto(`${BASE}/t/${mainId}/screen`, { waitUntil: 'domcontentloaded' });
	await screen.locator('.projector-step--side').waitFor({ timeout: TIMEOUT });
	check(
		'projector: the question',
		(await screen.locator('.projector-instruction').innerText()).includes(QUESTION),
	);
	check(
		'projector: both claims',
		(await screen.locator('.projector-character__claim').count()) === 2,
	);
	const overflow = await screen.evaluate(
		() => document.documentElement.scrollHeight > window.innerHeight + 1,
	);
	check('projector: fits 1080 p without scrolling', !overflow);
	await shot(screen, 'projector-1920');

	// 4. clearing the question brings back the default
	const qInput = teacher
		.locator('.plan-details__sides input, .plan-details__sides textarea')
		.first();
	await qInput.fill('');
	await qInput.blur();
	check(
		'empty question is saved',
		Boolean(await until(async () => (await settings()).sideQuestion === '')),
	);
	await screen
		.locator('.projector-instruction')
		.filter({ hasNotText: QUESTION })
		.waitFor({ timeout: TIMEOUT });
	check('projector falls back to the default question', true);
} catch (error) {
	check('flow completed', false, error instanceof Error ? error.message : String(error));
} finally {
	check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
	await browser.close();
	console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}
