// E2E: the Table talk clock. Real callables (functions emulator on).
//  A. the asker views the "talking" pill while the table is still at "pick": the header keeps
//     naming the OFFICIAL step, the names are disabled and a line says what to do first.
//  B. the asker picks a question, starts, taps a name: the big digits count down on the asker's
//     phone and on a tablemate's phone.
//
// Setup: see e2e-student-2.mjs (emulators with functions + vite). Example ports:
//   JOIN_CLASS_URL=http://localhost:3037 E2E_AUTH_PORT=9137 E2E_FIRESTORE_PORT=8137 \
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
	const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
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

try {
	const a = await newStudent('Dana');
	const b = await newStudent('Omer');
	const tableRef = db.doc(`classTables/${tableId}`);
	await tableRef.set({
		tableId, mainId, n: 1, memberUids: [a.uid, b.uid], noDeviceMembers: [], step: 'pick',
		askerUid: a.uid, turn: 1, writingMode: 'each', writingLocked: false, spokenUids: [],
		usedQuestionIds: [], updatedAt: Date.now(),
	});

	// A. viewed talk screen while the table is at pick -------------------------
	await a.page.waitForSelector('[data-testid=asker-mark]', { timeout: TIMEOUT });
	await a.page.locator('.substeps__pill').nth(1).click();
	await a.page.waitForSelector('[data-testid=table-next-speaker]', { timeout: TIMEOUT });
	const header = (await a.page.locator('.frame__header, header').first().innerText()).replace(/\s+/g, ' ');
	check('header names the official step (choosing a question), not the viewed one', /בוחרים שאלה|choosing a question/.test(header), header);
	// the server refuses nextSpeaker at pick: the asker must see an inline error, never nothing
	await a.page.locator('[data-testid=table-next-speaker]').nth(1).click();
	await a.page.waitForSelector('.c3-error', { timeout: TIMEOUT });
	check('a refused tap shows the inline error with retry', (await a.page.locator('.c3-error__retry').count()) === 1);

	// B. official talk, asker taps a name --------------------------------------
	await a.page.locator('.substeps__pill').nth(0).click();
	await a.page.locator('[data-testid=table-pick-question]').first().click();
	await a.page.click('[data-testid=table-start]');
	await until(async () => (await tableRef.get()).data()?.step === 'talk', 'table at talk');
	await a.page.waitForSelector('[data-testid=table-next-speaker]:not([disabled])', { timeout: TIMEOUT });
	await b.page.waitForSelector('[role=timer]', { timeout: TIMEOUT });
	const idle = await timerText(a.page);
	check('before the tap the digits read 1:00', idle === '1:00', idle);
	await a.page.locator('[data-testid=table-next-speaker]').nth(1).click();
	await until(async () => typeof (await tableRef.get()).data()?.speakerEndsAt === 'number', 'speakerEndsAt written');
	await new Promise((r) => setTimeout(r, 3500));
	const da = await timerText(a.page);
	const db2 = await timerText(b.page);
	check('asker digits count down below 1:00', toSeconds(da) < 60 && toSeconds(da) > 40, da);
	check('tablemate digits count down below 1:00', toSeconds(db2) < 60 && toSeconds(db2) > 40, db2);
	check('no inline error on the asker phone', (await a.page.locator('.c3-error').count()) === 0);
	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
	console.error('e2e-talk-clock aborted', e);
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
