// E2E: the Table talk clock (table turn v3: one screen per state, no strip, no peek). Real callables
// (functions emulator on), three phones at one table.
//  A. at pick the screen has no clock and no strip; a student picks a question and taps "I want to start":
//     the asker waits, a tablemate sees "I want to answer".
//  B. a tablemate taps "I want to answer": the big digits count down on the answerer's phone and on both
//     others' phones, the same second; only the answerer has Finish and it is off for the first second.
//  C. Finish ends the minute early: no "time over" words, the answerer moves to "you had your turn".
//
// Setup: see e2e-table-turn.mjs (emulators with functions + vite). Example ports:
//   JOIN_CLASS_URL=http://localhost:3040 E2E_AUTH_PORT=9140 E2E_FIRESTORE_PORT=8140 \
//     node scripts/e2e-talk-clock.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { BASE_URL as BASE, PROJECT_ID as PROJECT } from './e2e-env.mjs';

const TIMEOUT = 20000;
const here = dirname(fileURLToPath(import.meta.url));
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=4', '--seated', `--id=clock-${Date.now()}`],
	{ cwd: join(here, '..', '..', '..'), env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId } = seed;
const tableId = `${mainId}--1`;

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();
let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}
async function until(fn, label, ms = TIMEOUT) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		try {
			const value = await fn();
			if (value) return value;
		} catch {
			// keep polling
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`timed out: ${label}`);
}
const authUids = async () => new Set((await getAuth().listUsers(1000)).users.map((u) => u.uid));

const browser = await chromium.launch();
const errors = [];
async function newStudent(name) {
	const before = await authUids();
	const context = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'he-IL' });
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
	const uid = await until(async () => [...(await authUids())].find((id) => !before.has(id)), `${name} uid`);
	const subRef = db.doc(`statementsSubscribe/${uid}--${mainId}`);
	await until(async () => (await subRef.get()).exists, `${name} subscription`);
	await subRef.update({ tableId, side: 20, camp: 'a', 'user.displayName': name, lastUpdate: Date.now() });

	return { page, uid, name };
}
const timerText = async (page) => (await page.locator('[role=timer]').first().innerText()).trim();
const toSeconds = (text) => {
	const [mm, ss] = text.split(':').map(Number);

	return mm * 60 + ss;
};
const has = async (page, id) => (await page.locator(`[data-testid=${id}]`).count()) > 0;

try {
	const a = await newStudent('Dana');
	const b = await newStudent('Omer');
	const c = await newStudent('Noa');
	const tableRef = db.doc(`classTables/${tableId}`);
	await tableRef.set({
		tableId, mainId, n: 1, memberUids: [a.uid, b.uid, c.uid], noDeviceMembers: [], step: 'pick',
		askerUid: null, turn: 1, writingMode: 'each', writingLocked: false, spokenUids: [],
		usedQuestionIds: [], updatedAt: Date.now(),
	});

	// A. pick, then start ------------------------------------------------------
	await a.page.waitForSelector('[data-testid=table-claim]', { timeout: TIMEOUT });
	check('no clock and no strip at pick', (await a.page.locator('[role=timer], .substeps').count()) === 0);
	await a.page.locator('[data-testid=table-pick-question]').first().click();
	await a.page.click('[data-testid=table-claim]');
	await until(async () => (await tableRef.get()).data()?.step === 'talk', 'table at talk');
	await b.page.waitForSelector('[data-testid=table-answer]', { timeout: TIMEOUT });
	check('the asker waits: no answer button, no clock', !(await has(a.page, 'table-answer')) && (await a.page.locator('[role=timer]').count()) === 0);
	check('a tablemate sees "I want to answer" and no clock before anyone answers', (await has(b.page, 'table-answer')) && (await b.page.locator('[role=timer]').count()) === 0);

	// B. the minute --------------------------------------------------------------
	await b.page.click('[data-testid=table-answer]');
	await until(async () => typeof (await tableRef.get()).data()?.speakerEndsAt === 'number', 'speakerEndsAt written');
	for (const s of [a, b, c]) await s.page.waitForSelector('[role=timer]', { timeout: TIMEOUT });
	const idle = await timerText(b.page);
	check('the digits start at the top of the minute', toSeconds(idle) >= 55 && toSeconds(idle) <= 60, idle);
	check('only the answerer has Finish, off for the first second', (await has(b.page, 'table-finish')) && !(await has(a.page, 'table-finish')) && !(await has(c.page, 'table-finish')) && (await b.page.locator('[data-testid=table-finish]').isDisabled()));
	await new Promise((r) => setTimeout(r, 3500));
	const texts = [await timerText(a.page), await timerText(b.page), await timerText(c.page)];
	check('all three phones count down below the top, on the same clock', texts.every((x) => toSeconds(x) < 60 && toSeconds(x) > 40) && Math.max(...texts.map(toSeconds)) - Math.min(...texts.map(toSeconds)) <= 1, texts.join(' '));
	check('Finish is on after the first second', !(await b.page.locator('[data-testid=table-finish]').isDisabled()));

	// C. Finish ---------------------------------------------------------------------
	await b.page.click('[data-testid=table-finish]');
	await until(async () => { const d = (await tableRef.get()).data(); return d.speakerEndsAt <= Date.now() && d.spokenUids.includes(b.uid); }, 'finish written');
	await b.page.waitForFunction(() => /כבר עניתם/.test(document.body.innerText));
	check('no "time over" words and no clock after Finish', (await b.page.locator('[role=timer], [data-testid=time-over]').count()) === 0);
	await a.page.waitForSelector('[data-testid=table-answer]', { timeout: TIMEOUT });
	check('the asker may answer once one tablemate did', true);
	check('no inline errors, no page errors', (await a.page.locator('.c3-error').count()) === 0 && errors.length === 0, errors.join(' | '));
} catch (e) {
	console.error('e2e-talk-clock aborted', e);
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
