// E2E for the first student screens (lane C2): waiting -> opening -> side -> my table.
// Runs on lane C2's own emulator ports (auth 9132, firestore 8132) with vite on 3032:
//
//   # repo root: emulators (the throwaway config adds a classTables read rule)
//   npx firebase emulators:start -c firebase.c2.local.json --project freedi-test --only firestore,auth
//   # apps/join-class:
//   VITE_EMULATOR_AUTH_PORT=9132 VITE_EMULATOR_FIRESTORE_PORT=8132 \
//     VITE_EMULATOR_FUNCTIONS_PORT=5032 VITE_EMULATOR_DATABASE_PORT=9032 \
//     npx vite --port 3032 --strictPort
//   # then:
//   node scripts/e2e-student-1.mjs
//
// The app runs in its default language, Hebrew (RTL), so assertions use the Hebrew strings.
// Seeds a class at step 0 with seated students, opens a 390px student phone by class
// code, and walks the teacher's step through 0..3 with admin-SDK writes. No networkidle waits.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const AUTH_PORT = process.env.E2E_AUTH_PORT ?? '9132';
const FS_PORT = process.env.E2E_FS_PORT ?? '8132';
const BASE = process.env.JOIN_CLASS_URL ?? 'http://localhost:3032';
const PROJECT = 'freedi-test';
const TIMEOUT = 15000;
const STUDENT_NAME = 'Dana E2E';
const VIDEO_URL = 'https://example.test/dilemma.mp4';

process.env.FIRESTORE_EMULATOR_HOST = `localhost:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `localhost:${AUTH_PORT}`;
process.env.GCLOUD_PROJECT = PROJECT;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

// ---- seed -------------------------------------------------------------------
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=0', '--seated', '--students=8'],
	{ cwd: repoRoot, env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId, classCode, challengeId } = seed;

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const db = getFirestore(initializeApp({ projectId: PROJECT }));

const setStep = (index) =>
	db.doc(`statements/${mainId}`).update({ 'statementSettings.lessonPlan.stepIndex': index });

async function mySubscription() {
	const snap = await db
		.collection('statementsSubscribe')
		.where('statementId', '==', mainId)
		.where('user.displayName', '==', STUDENT_NAME)
		.get();

	return snap.empty ? null : snap.docs[0];
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

// ---- the student phone -------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: { width: 390, height: 844 },
	locale: 'he-IL',
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const main = page.locator('.frame');

try {
	// 0. code -> name once -> waiting
	await page.goto(`${BASE}/c/${classCode}`, { waitUntil: 'domcontentloaded' });
	await page.locator('.name-entry__input').waitFor({ timeout: TIMEOUT });
	check('arriving by code asks the name once', true);
	const joinBtn = page.locator('.frame__action .btn');
	check('Join disabled until a name is typed', await joinBtn.isDisabled());
	await page.fill('.name-entry__input', STUDENT_NAME);
	await joinBtn.click();
	await page.locator('.waiting__title').waitFor({ timeout: TIMEOUT });
	check(
		'waiting screen says wait for the teacher',
		(await page.locator('.waiting__title').innerText()).includes('ממתינים למורה'),
	);
	await page.locator('.waiting__count').waitFor({ timeout: TIMEOUT });
	const count = (await page.locator('.waiting__count').innerText()).match(/\d+/)?.[0];
	check('waiting shows the joined count', Number(count) >= 8, `count=${count}`);
	check('waiting has no button', (await page.locator('.frame__action').count()) === 0);
	const sub = await until(mySubscription);
	check('the teacher roster gets the typed name', Boolean(sub));
	const myUid = sub?.data().userId;

	// 1. opening
	await setStep(1);
	await page.locator('.opening__question').waitFor({ timeout: TIMEOUT });
	const challenge = (await db.doc(`statements/${challengeId}`).get()).data();
	check(
		'opening shows "Watch together" and the challenge question',
		(await main.innerText()).includes('צופים ביחד') &&
			(await page.locator('.opening__question').innerText()).includes(challenge.statement),
	);
	check(
		'no video without a video url',
		(await page.locator('.opening video, .opening iframe, .opening__play').count()) === 0,
	);
	await db.doc(`statements/${mainId}`).update({ 'statementSettings.videoUrl': VIDEO_URL });
	await page.locator('.opening__play').waitFor({ timeout: TIMEOUT });
	check('video never autoplays: only a play button before the tap', (await page.locator('video').count()) === 0);
	await page.click('.opening__play');
	// example.test never serves a real file: the player appears, then fails to the
	// "teacher is projecting" note. Either way the play button is gone.
	check(
		'tap starts the video (player or the failed note)',
		Boolean(await until(async () => (await page.locator('.opening__play').count()) === 0)),
	);

	// 2. side
	await setStep(2);
	const slider = page.locator('input.side-slider__input');
	await slider.waitFor({ timeout: TIMEOUT });
	check(
		'side screen asks which side',
		(await main.innerText()).includes('לאיזה צד אתם קרובים?'),
	);
	check('slider is ltr, 0..100, thumb 48px', (await slider.evaluate((el) => {
		const root = el.closest('.side-slider');
		return root?.getAttribute('dir') === 'ltr' && el.min === '0' && el.max === '100' && getComputedStyle(root).getPropertyValue('--thumb').trim() === '48px';
	})));
	check('Confirm is disabled before the first touch', await page.locator('.frame__action .btn').isDisabled());
	check('centre label before touching', (await slider.getAttribute('aria-valuetext')) === 'באמצע');
	await slider.focus();
	for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowRight');
	check(
		'word label follows the thumb',
		Boolean(await until(async () => (await slider.getAttribute('aria-valuetext')) === 'קרוב לנועה')),
		await slider.getAttribute('aria-valuetext'),
	);
	const savedB = await until(async () => {
		const s = (await mySubscription())?.data();

		return s?.side === 70 && s?.camp === 'b' ? s : null;
	});
	check('side 70 / camp b written to the subscription', Boolean(savedB));
	await page.locator('.frame__action .btn--agree').waitFor({ timeout: TIMEOUT });
	check('screen shows the saved state', (await page.locator('.frame__action .btn--agree').innerText()) === 'נשמר');
	await page.keyboard.press('Home');
	const savedA = await until(async () => {
		const s = (await mySubscription())?.data();

		return s?.side === 0 && s?.camp === 'a' ? s : null;
	});
	check('Home writes side 0 / camp a', Boolean(savedA));

	// 3. my table: first not placed, then seated; refresh lands on the same step
	await setStep(3);
	await page.locator('.table-step__empty').waitFor({ timeout: TIMEOUT });
	check(
		'no table yet: wait for the teacher',
		(await page.locator('.table-step__empty').innerText()).includes('עוד אין לכם שולחן'),
	);
	const table = seed.tables[0];
	await db.doc(`classTables/${table.tableId}`).update({ memberUids: FieldValue.arrayUnion(myUid) });
	await sub.ref.update({ tableId: table.tableId });
	await page.locator('.table-step__number').waitFor({ timeout: TIMEOUT });
	check(
		'big table number',
		(await page.locator('.table-step__number').innerText()) === `שולחן ${table.n}`,
	);
	await page.locator('.table-chip').nth(3).waitFor({ timeout: TIMEOUT });
	const chipTexts = await page.locator('.table-chip').allInnerTexts();
	check('chips list me first with a side mark', chipTexts[0].includes(STUDENT_NAME) && chipTexts[0].includes('●'), chipTexts[0]);
	const mate = seed.students.find((s) => table.memberUids.includes(s.uid));
	check(
		'chips include a tablemate',
		chipTexts.length === table.memberUids.length + 1 &&
			chipTexts.some((t) => t.includes(mate.name)),
		chipTexts.join(' | '),
	);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('.table-step__number').waitFor({ timeout: TIMEOUT });
	check('a refreshed phone lands on the current step', true);
	await page.setViewportSize({ width: 390, height: 844 });
	check(
		'no horizontal scroll at 390px',
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
	);
	check('document is RTL', await page.evaluate(() => document.documentElement.dir === 'rtl'));
	check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
	check('script completed', false, String(error));
	await page.screenshot({ path: join(here, '.e2e-student-1-fail.png') }).catch(() => undefined);
} finally {
	await browser.close();
}

console.info(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
