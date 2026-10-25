// E2E: live writing at the table (IA 17, UX 1-11) and the free Proposals sub-steps (IA 17.13).
// Three phones at table 1 (Dana, Tal, Noa) and one at table 2 (Eli), 375x812, Hebrew, real emulators
// (auth, firestore, database; the functions emulator is not needed). Cases:
//   1 free sub-steps: the table step is "talk"; Dana taps כותבים, Tal taps מדרגים, Noa stays; nothing is
//     greyed out (no peek-body, peek-back, pill-now); the table doc stays at "talk" and no phone ever calls
//     classTableStep; the header follows the phone's own sub-step
//   2 Dana types with broadcast on: Tal (מדרגים) and Noa (מדברים) see the line with her name, Dana does
//     not see her own, Eli (table 2) never sees it; the polite region announces "started broadcasting"
//   3 tap the line: the watch view shows her text, more typing updates it, the caret is a separate node
//   4 Noa writes too: the line says "2 כותבים עכשיו", the picker appears, a pill switches the writer
//   5 Dana sends: the watch view turns "sent" (heading, solid border), the view stays open
//   6 "סגירה" closes it: Tal is back on מדרגים (same pill current), focus on the line, history intact
//   7 Noa unticks broadcast while Tal watches her: "stopped"; the line leaves after the 1.5 s wait
//   8 Dana can still write and send from כותבים while the table is at "talk" (no classTableStep call)
//   9 a table sheet at the plenum hides the line (roundPhase improve)
//
// Setup (own ports; repo root; see e2e-table-turn.mjs):
//   npx firebase emulators:start -c firebase.t4.local.json --project freedi-test --only auth,firestore,database
//   (apps/join-class) VITE_EMULATOR_AUTH_PORT=9143 VITE_EMULATOR_FIRESTORE_PORT=8143 \
//     VITE_EMULATOR_DATABASE_PORT=9043 VITE_EMULATOR_FUNCTIONS_PORT=5043 npx vite --port 3043 --strictPort
//   JOIN_CLASS_URL=http://localhost:3043 E2E_AUTH_PORT=9143 E2E_FIRESTORE_PORT=8143 \
//     node scripts/e2e-live-writing.mjs
// Optional: SHOTS=<dir> saves t4-line.png and t4-watch.png (dark mode).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { BASE_URL as BASE, PROJECT_ID as PROJECT } from './e2e-env.mjs';

const TIMEOUT = 20000;
const SHOTS = process.env.SHOTS;
const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=5', '--seated', '--tokens', `--id=live-${Date.now()}`],
	{ cwd: REPO, env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId } = seed;
const table1 = `${mainId}--1`;
const table2 = `${mainId}--2`;

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
		await new Promise((r) => setTimeout(r, 120));
	}
	throw new Error(`timed out: ${label}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const authUids = async () => new Set((await getAuth().listUsers(1000)).users.map((u) => u.uid));
const tid = (id) => `[data-testid=${id}]`;
const count = (page, selector) => page.locator(selector).count();
const text = async (page, selector) =>
	((await page.locator(selector).first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
const pill = (page, step) => page.locator(`.substeps__pill[data-step=${step}]`);
const current = async (page) =>
	(await page.locator('.substeps__pill[aria-current=true]').first().getAttribute('data-step').catch(() => null));

const browser = await chromium.launch();
const errors = [];
const stepCalls = [];

async function newPhone(name, tableId) {
	const before = await authUids();
	const context = await browser.newContext({
		viewport: { width: 375, height: 812 },
		locale: 'he-IL',
		colorScheme: SHOTS ? 'dark' : 'light',
	});
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	page.on('request', (r) => {
		if (r.url().includes('classTableStep')) stepCalls.push(`${name}: ${r.url()}`);
	});
	await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
	const uid = await until(
		async () => [...(await authUids())].find((id) => !before.has(id)),
		`${name} uid`,
	);
	const subRef = db.doc(`statementsSubscribe/${uid}--${mainId}`);
	await until(async () => (await subRef.get()).exists, `${name} subscription`);
	await subRef.update({ tableId, side: 20, camp: 'a', 'user.displayName': name, lastUpdate: Date.now() });

	return { page, uid, name, subRef, tableId };
}

const phones = [];
try {
	for (const name of ['Dana', 'Tal', 'Noa']) phones.push(await newPhone(name, table1));
	const eli = await newPhone('Eli', table2);
	phones.push(eli);
	const [dana, tal, noa] = phones;
	const baseTable = (id, n, memberUids) => ({
		tableId: id, mainId, n, memberUids, noDeviceMembers: [],
		step: 'talk', askerUid: null, turn: 1, writingMode: 'each', writingLocked: false,
		spokenUids: [], usedQuestionIds: [], updatedAt: Date.now(),
	});
	await db.doc(`classTables/${table1}`).set(baseTable(table1, 1, [dana.uid, tal.uid, noa.uid]));
	await db.doc(`classTables/${table2}`).set(baseTable(table2, 2, [eli.uid]));
	// the phones listened while the seeded tables seated other students: re-target them
	for (const s of phones) {
		await s.subRef.update({ tableId: 'retarget', lastUpdate: Date.now() });
		await wait(250);
		await s.subRef.update({ tableId: s.tableId, lastUpdate: Date.now() });
	}
	const tableDoc = async () => (await db.doc(`classTables/${table1}`).get()).data();
	for (const s of phones) await s.page.waitForSelector('.substeps', { timeout: TIMEOUT });
	const noneOf = async (page, selectors) => (await count(page, selectors)) === 0;

	// 1. free sub-steps ------------------------------------------------------------------------------
	check('1 every phone lands on the table step (talk)', (await Promise.all(phones.map((s) => current(s.page)))).every((c) => c === 'talk'));
	check('1 the strip has no "now" mark', await noneOf(dana.page, '[data-testid=pill-now], .substeps__now'));
	await pill(dana.page, 'write').click();
	await pill(tal.page, 'rate').click();
	check('1 Dana is on כותבים, Tal on מדרגים, Noa still on מדברים', (await current(dana.page)) === 'write' && (await current(tal.page)) === 'rate' && (await current(noa.page)) === 'talk');
	await dana.page.waitForSelector(tid('proposal-box'), { timeout: TIMEOUT });
	check('1 the write box is live for Dana (not read-only, not in a disabled fieldset)', !(await dana.page.locator(tid('proposal-box')).isDisabled()) && !(await dana.page.locator(tid('proposal-box')).evaluate((el) => el.readOnly)) && (await count(dana.page, 'fieldset[disabled]')) === 0);
	check('1 no peek screen, no "back to now", no asker line, anywhere', (await Promise.all(phones.map((s) => noneOf(s.page, '[data-testid=peek-body], [data-testid=peek-back], [data-testid=asker-mark], .flow__peek')))).every(Boolean));
	check('1 the header follows the phone\'s own sub-step', /עכשיו: כותבים/.test(await text(dana.page, '.frame__header')) && /עכשיו: מדרגים/.test(await text(tal.page, '.frame__header')) && /עכשיו: מדברים/.test(await text(noa.page, '.frame__header')), await text(tal.page, '.frame__header'));
	check('1 the table doc is still at "talk"', (await tableDoc()).step === 'talk');
	check('1 the shortcut "סיימנו, לכתוב" switches only the phone', await (async () => {
		await noa.page.click(tid('table-to-write'));
		await until(async () => (await current(noa.page)) === 'write', 'Noa on write');

		return (await tableDoc()).step === 'talk';
	})());
	await pill(noa.page, 'talk').click();

	// 2. Dana types, the table sees the line -----------------------------------------------------------
	const danaText = 'עדיף לשמור את הטלפונים בקופסה בזמן השיעור';
	await dana.page.locator(tid('proposal-box')).fill(danaText);
	const line = (s) => s.page.locator(tid('live-line'));
	await line(tal).waitFor({ timeout: TIMEOUT });
	await line(noa).waitFor({ timeout: TIMEOUT });
	check('2 Tal (מדרגים) sees the line with Dana\'s name', /Dana כותב\/ת עכשיו/.test(await text(tal.page, tid('live-line'))), await text(tal.page, tid('live-line')));
	check('2 Noa (מדברים) sees it too, under the strip, outside the body', await noa.page.evaluate(() => {
		const el = document.querySelector('[data-testid=live-line]');
		const strip = document.querySelector('.substeps');
		return !!el && !!strip && !!(strip.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
	}));
	check('2 the line is a button with the accessible name and a dialog popup', (await line(tal).getAttribute('aria-label')) === 'Dana כותב/ת עכשיו, לצפות בכתיבה' && (await line(tal).getAttribute('aria-haspopup')) === 'dialog');
	check('2 Dana does not see her own line', (await count(dana.page, tid('live-line'))) === 0);
	await wait(1200);
	check('2 Eli (table 2) never sees it', (await count(eli.page, tid('live-line'))) === 0);
	check('2 the polite region said "started broadcasting" once', /Dana התחיל\/ה לשדר/.test(await tal.page.locator(tid('live-status')).first().textContent()));
	if (SHOTS) {
		mkdirSync(SHOTS, { recursive: true });
		await tal.page.screenshot({ path: join(SHOTS, 't4-line.png') });
	}

	// 3. tap: the watch view ---------------------------------------------------------------------------
	const url0 = tal.page.url();
	await line(tal).click();
	await tal.page.waitForSelector(tid('watch-view'), { timeout: TIMEOUT });
	check('3 the watch view opens with her text, state live', (await text(tal.page, '.watch__text')).includes(danaText) && (await tal.page.locator(tid('watch-view')).getAttribute('data-state')) === 'live');
	check('3 the heading names her and has focus', /Dana כותב\/ת עכשיו/.test(await text(tal.page, '.watch__title')) && (await tal.page.evaluate(() => document.activeElement?.classList.contains('watch__title'))));
	check('3 a dialog, no picker with one writer, a caret node apart from the text', (await tal.page.locator(tid('watch-view')).getAttribute('role')) === 'dialog' && (await count(tal.page, tid('watch-writer'))) === 0 && (await count(tal.page, '.watch__caret')) === 1);
	check('3 the text is not a live region', (await count(tal.page, '.watch [aria-live]')) === 0);
	const more = `${danaText} ובהפסקות מוציאים אותם`;
	await dana.page.locator(tid('proposal-box')).fill(more);
	await until(async () => (await text(tal.page, '.watch__text')).includes('ובהפסקות'), 'the watch text updates');
	check('3 more typing updates the text in place', true);
	check('3 the page under the sheet stayed on מדרגים', (await current(tal.page)) === 'rate' && tal.page.url() === url0);

	// 4. a second writer -------------------------------------------------------------------------------
	await pill(noa.page, 'write').click();
	await noa.page.locator(tid('proposal-box')).fill('להתייעץ עם ההורים');
	await until(async () => (await count(tal.page, tid('watch-writer'))) === 2, 'the picker appears');
	check('4 the line says "2 כותבים עכשיו"', /2 כותבים עכשיו/.test(await text(tal.page, tid('live-line'))), await text(tal.page, tid('live-line')));
	const names = await tal.page.locator(tid('watch-writer')).allInnerTexts();
	check('4 the picker lists both in seating order, the watched one pressed', names.join(',') === 'Dana,Noa' && (await tal.page.locator(tid('watch-writer')).first().getAttribute('aria-pressed')) === 'true', names.join(','));
	if (SHOTS) await tal.page.screenshot({ path: join(SHOTS, 't4-watch.png') });
	await tal.page.locator(tid('watch-writer')).nth(1).click();
	await until(async () => /Noa כותב\/ת עכשיו/.test(await text(tal.page, '.watch__title')), 'switched to Noa');
	check('4 a pill switches the writer, heading and text', (await text(tal.page, '.watch__text')).includes('להתייעץ') && (await tal.page.locator(tid('watch-writer')).nth(1).getAttribute('aria-pressed')) === 'true');
	await tal.page.locator(tid('watch-writer')).nth(0).click();

	// 5. Dana sends while watched ----------------------------------------------------------------------
	await dana.page.click(tid('proposal-send'));
	await until(async () => (await tal.page.locator(tid('watch-view')).getAttribute('data-state')) === 'sent', 'sent');
	check('5 the view turns "sent": the heading says so, the last text stays', /Dana שלח\/ה את ההצעה/.test(await text(tal.page, '.watch__title')) && (await text(tal.page, '.watch__text')).includes('ובהפסקות') && (await count(tal.page, '.watch__caret')) === 0);
	check('5 the view did not close itself and Noa\'s pill is still offered', (await count(tal.page, tid('watch-view'))) === 1 && (await count(tal.page, tid('watch-writer'))) === 2);
	check('5 the sent line was announced', /Dana שלח\/ה את ההצעה/.test(await tal.page.locator(tid('live-status')).first().textContent()));

	// 6. close -----------------------------------------------------------------------------------------
	await tal.page.click(tid('watch-close'));
	await until(async () => (await count(tal.page, tid('watch-view'))) === 0, 'closed');
	check('6 closed: Tal is back on מדרגים with the same current pill', (await current(tal.page)) === 'rate' && tal.page.url() === url0);
	check('6 focus returned to the line (Noa still writes)', await tal.page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'live-line'));
	await line(tal).click();
	await tal.page.waitForSelector(tid('watch-view'));
	await tal.page.keyboard.press('Escape');
	await until(async () => (await count(tal.page, tid('watch-view'))) === 0, 'escape closes');
	await line(tal).click();
	await tal.page.waitForSelector(tid('watch-view'));
	await tal.page.goBack();
	await until(async () => (await count(tal.page, tid('watch-view'))) === 0, 'back gesture closes');
	check('6 Escape and the back gesture close it and keep Tal on מדרגים', (await current(tal.page)) === 'rate' && tal.page.url() === url0);
	await line(tal).click();
	await tal.page.waitForSelector(tid('watch-view'));
	await tal.page.mouse.click(187, 40);
	await until(async () => (await count(tal.page, tid('watch-view'))) === 0, 'scrim closes');
	check('6 a tap on the scrim closes it', true);

	// 7. stopped, and the line leaves ------------------------------------------------------------------
	await line(tal).click();
	await tal.page.waitForSelector(tid('watch-view'));
	check('7 with Noa the only writer the view opens on her, no picker', /Noa/.test(await text(tal.page, '.watch__title')) && (await count(tal.page, tid('watch-writer'))) === 0);
	await noa.page.locator('.write-panel__broadcast input').uncheck();
	await until(async () => (await tal.page.locator(tid('watch-view')).getAttribute('data-state')) === 'stopped', 'stopped');
	check('7 the view says she stopped broadcasting, the last text stays', /Noa הפסיק\/ה לשדר/.test(await text(tal.page, '.watch__title')) && (await text(tal.page, '.watch__text')).includes('להתייעץ'));
	const stoppedAt = Date.now();
	await until(async () => (await count(tal.page, tid('live-line'))) === 0, 'the line leaves');
	const leftAfter = Date.now() - stoppedAt;
	check('7 the line left behind the open view, after the 1.5 s wait', leftAfter >= 1000 && leftAfter < 5000, `${leftAfter} ms after the stop`);
	check('7 the open view stayed', (await count(tal.page, tid('watch-view'))) === 1);
	await tal.page.click(tid('watch-close'));
	await until(async () => (await count(tal.page, tid('watch-view'))) === 0, 'closed');
	check('7 with the line gone, focus goes to the current pill', await tal.page.evaluate(() => document.activeElement?.getAttribute('aria-current') === 'true'));

	// 8. write and send while the table is at talk -----------------------------------------------------
	await dana.page.locator(tid('proposal-box')).fill('הצעה חדשה בלי להזיז את השולחן');
	await dana.page.click(tid('proposal-send'));
	await until(async () => (await dana.page.locator(tid('proposal-send')).isDisabled()), 'sent state');
	check('8 a proposal was written and sent while the table stayed at "talk"', (await tableDoc()).step === 'talk');
	check('8 no phone ever called classTableStep', stepCalls.length === 0, stepCalls.join(' | '));

	// 9. the plenum hides the line ---------------------------------------------------------------------
	await noa.page.locator('.write-panel__broadcast input').check();
	await noa.page.locator(tid('proposal-box')).fill('עוד משהו בזמן שמשדרים');
	await line(tal).waitFor({ timeout: TIMEOUT });
	await db.doc(`statements/${seed.challengeId}`).update({ 'statementSettings.roundPhase': 'improve' });
	await until(async () => (await count(tal.page, tid('live-line'))) === 0, 'the line is hidden at the plenum', 8000);
	check('9 the line is hidden at the plenum', true);
	await db.doc(`statements/${seed.challengeId}`).update({ 'statementSettings.roundPhase': 'propose' });

	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (error) {
	console.error('E2E aborted:', error);
	failures += 1;
} finally {
	await browser.close();
}
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
