// E2E: the table turn v2 (UX 16 rev 2). Real callables (functions emulator on), four phones at one
// table and the teacher console. Fifteen cases:
//   1 fresh table: every phone at V1 ("who wants to ask first?"), four claim buttons, two pills
//   2 simultaneous volunteers: one winner, turn stays 1, the loser sees A and no error
//   3 the asker picks (live on the others, the card says "לדבר"), B: only the asker's chips work
//   4 pass the minute (speaker, asker for them), the floor opens, a re-called speaker reads spoken
//   5 everyone spoke: V2 stays dark, "כולם דיברו", the asker's chip is done, three claim buttons
//   6 pass asking: one inline confirm, cancel keeps everything, yes passes (max - 1)
//   7 the asker passes at A: back to V1, the question is free again, their chip is passed
//   8 the last student: only Lior has "אני אשאל"; everyone and the card wait for him
//   9 done: paper, "סיימתם את הסבבים", no strip, no footer; the card "כולם סיימו · שאלו 3 · ויתרו 1"
//  10 all pass at V1: done at once, "שאלו 0 · ויתרו 4"
//  11 the teacher opens V1 ("להתחיל סבב 2"), then gives the turn to Lior from the sheet
//  12 peek: dimmed list, dark frame, no claim/pass, "חזרה לעכשיו", the phone jumps on a real change
//  13 the teacher's questions run out: the own-question box, one tap to talk; a forged used pick is refused
//  14 forged and paused: already-asked / already-passed / talk-not-over / not-speaker; paused refuses all
//  15 reduced motion + axe on V1, A, C, V2 and done
//
// Setup (own ports; repo root):
//   FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:start -c firebase.turn2.local.json \
//     --project freedi-test --only auth,firestore,functions,database
//   (apps/join-class) VITE_EMULATOR_AUTH_PORT=9139 VITE_EMULATOR_FIRESTORE_PORT=8139 \
//     VITE_EMULATOR_DATABASE_PORT=9039 VITE_EMULATOR_FUNCTIONS_PORT=5039 npx vite --port 3039 --strictPort
//   JOIN_CLASS_URL=http://localhost:3039 E2E_AUTH_PORT=9139 E2E_FIRESTORE_PORT=8139 \
//     E2E_FUNCTIONS_PORT=5039 node scripts/e2e-table-turn.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import {
	AUTH_PORT,
	BASE_URL as BASE,
	FUNCTIONS_PORT,
	PROJECT_ID as PROJECT,
} from './e2e-env.mjs';

const TIMEOUT = 20000;
const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..', '..');
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=4', '--seated', '--tokens', `--id=turn-${Date.now()}`],
	{ cwd: REPO, env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId } = seed;
const tableId = `${mainId}--1`;
const axeSource = readFileSync(
	createRequire(join(REPO, 'package.json')).resolve('axe-core/axe.min.js'),
	'utf8',
);

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const tableRef = db.doc(`classTables/${tableId}`);
const mainRef = db.doc(`statements/${mainId}`);
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
		await new Promise((r) => setTimeout(r, 150));
	}
	throw new Error(`timed out: ${label}`);
}
const authUids = async () => new Set((await getAuth().listUsers(1000)).users.map((u) => u.uid));
const tid = (id) => `[data-testid=${id}]`;
const tableDoc = async () => (await tableRef.get()).data();
const textOf = async (page, selector) =>
	((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim();
const count = (page, selector) => page.locator(selector).count();
const has = async (page, id) => (await count(page, tid(id))) > 0;
const askerStates = (page) =>
	page.locator('.askers__chip').evaluateAll((els) => els.map((e) => e.dataset.state));
const speakerChips = (page) =>
	page.locator('.talk__chip').evaluateAll((els) => els.map((e) => `${e.dataset.state}${e.disabled ? ':off' : ':on'}`));
const isDown = (page) => page.locator('.frame--down').count().then((n) => n > 0);

const browser = await chromium.launch();
const errors = [];
async function newPhone(name, { reducedMotion = false } = {}) {
	const before = await authUids();
	const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'he-IL' });
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
	const uid = await until(
		async () => [...(await authUids())].find((id) => !before.has(id)),
		`${name} uid`,
	);
	const subRef = db.doc(`statementsSubscribe/${uid}--${mainId}`);
	await until(async () => (await subRef.get()).exists, `${name} subscription`);
	await subRef.update({ tableId, side: 20, camp: 'a', 'user.displayName': name, lastUpdate: Date.now() });

	return { page, uid, name, context };
}

async function signInToken(uid) {
	const custom = typeof uid === 'string' && uid === 'teacher' ? seed.teacher.customToken : await getAuth().createCustomToken(uid);
	const signIn = await fetch(
		`http://localhost:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: custom, returnSecureToken: true }),
		},
	);

	return (await signIn.json()).idToken;
}

/** Call classTableStep over HTTP as `uid` (or 'teacher'), as a forged client could. */
async function callStep(uid, body) {
	const idToken = await signInToken(uid);
	const res = await fetch(`http://localhost:${FUNCTIONS_PORT}/${PROJECT}/me-west1/classTableStep`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
		body: JSON.stringify({ data: { tableId, ...body } }),
	});
	const json = await res.json();

	return json.error ? { status: json.error.status, reason: json.error.details?.reason } : { ok: true };
}

try {
	const students = [];
	for (const name of ['Dana', 'Noa', 'Omri', 'Lior']) students.push(await newPhone(name));
	const [dana, noa, omri, lior] = students;
	const uids = students.map((s) => s.uid);
	const baseTable = () => ({
		tableId, mainId, n: 1, memberUids: uids, noDeviceMembers: [],
		step: 'pick', askerUid: null, turn: 1, writingMode: 'each', writingLocked: false,
		spokenUids: [], usedQuestionIds: [], updatedAt: Date.now(),
	});
	/** Put the table in a known state (a whole document, as the engine writes it). */
	const setTable = (patch = {}) => tableRef.set({ ...baseTable(), ...patch });
	/** V2 of turn 1: Noa asked, everyone spoke (Omri passed his minute). */
	const v2 = (patch = {}) => ({
		step: 'talk', askerUid: noa.uid, questionId: seed.guidingIds[0], usedQuestionIds: [seed.guidingIds[0]],
		askedUids: [noa.uid], spokenUids: uids, passedSpeakingUids: [omri.uid], ...patch,
	});
	// the teacher console, kept open for the whole run
	const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
	const tpage = await tctx.newPage();
	tpage.on('pageerror', (e) => errors.push(`teacher: ${e.message}`));
	await tpage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await tpage.evaluate(async (token) => {
		const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
		const { auth } = await import('/src/lib/firebase.ts');
		await authMod.signInWithCustomToken(auth, token);
	}, seed.teacher.customToken);
	await setTable();
	await tpage.goto(`${BASE}/t/${mainId}`, { waitUntil: 'domcontentloaded' });
	const card = '.table-card[data-table="1"]';
	await tpage.locator(card).waitFor({ timeout: TIMEOUT });
	const cardText = (sel) => textOf(tpage, `${card} ${sel}`).catch(() => '');

	// 1. fresh table: V1 on every phone -------------------------------------------------
	for (const s of students) await s.page.waitForSelector(tid('askers-row'), { timeout: TIMEOUT });
	for (const s of students) {
		const states = await askerStates(s.page);
		check(`1 ${s.name}: askers row all not-yet`, states.join() === 'wait,wait,wait,wait', states.join());
		check(`1 ${s.name}: "who wants to ask first?" and the claim button`, /מי רוצה לשאול ראשון/.test(await textOf(s.page, '.frame__instruction')) && (await has(s.page, 'table-claim')), await textOf(s.page, '.frame__instruction'));
		check(`1 ${s.name}: no asker mark, a paper frame, two pills`, !(await has(s.page, 'asker-mark')) && !(await isDown(s.page)) && (await count(s.page, '.substeps__pill')) === 2);
	}
	check('1 the header says turn 1 of 4', /סבב 1 מתוך 4/.test(await textOf(dana.page, '.frame__header')), await textOf(dana.page, '.frame__header'));
	check('1 the teacher card waits for a volunteer', /ממתינים למי שישאל/.test(await cardText('.table-card__wait')), await cardText('.table-card__wait'));
	check('1 the teacher card has no quick button at V1', (await count(tpage, `${card} [data-quick]`)) === 0);

	// 2. simultaneous volunteers -----------------------------------------------------------
	await Promise.all([noa.page.click(tid('table-claim')), omri.page.click(tid('table-claim'))]);
	const claimed = await until(async () => ((await tableDoc()).askerUid ? await tableDoc() : null), 'a claim won');
	const winner = students.find((s) => s.uid === claimed.askerUid);
	const loser = winner === noa ? omri : noa;
	check('2 exactly one claim won, the turn stays 1, still at pick', [noa.uid, omri.uid].includes(claimed.askerUid) && claimed.turn === 1 && claimed.step === 'pick', winner.name);
	await loser.page.waitForFunction((n) => new RegExp(n).test(document.querySelector('.flow__asker')?.textContent ?? ''), winner.name, { timeout: TIMEOUT });
	check('2 the loser sees A with the winner\'s name and no error', (await count(loser.page, '.c3-error')) === 0 && /בחרו שאלה|לבחור שאלה/.test(await textOf(loser.page, '.frame__instruction')), await textOf(loser.page, '.frame__instruction'));
	check('2 the winner reads "your turn to ask"', /התור שלכם לשאול/.test(await textOf(winner.page, '.flow__asker')));
	await until(async () => /ויתרתי על התור/.test(await textOf(winner.page, '.claim-footer')), 'pass link at A');

	// 3. the asker picks; B: only the asker's chips work --------------------------------------
	const others = students.filter((s) => s !== winner);
	check('3 nobody but the asker can tap a question', await others[0].page.locator(tid('table-pick-question')).first().isDisabled());
	await winner.page.locator(tid('table-pick-question')).first().click();
	await until(async () => (await tableDoc()).questionId, 'pickQuestion written at the tap');
	await others[0].page.waitForSelector('.pick__item--on', { timeout: TIMEOUT });
	check('3 a tap on a question shows on a tablemate phone at once', true);
	await tpage.waitForSelector(`${card} [data-quick=talk]`, { timeout: TIMEOUT });
	check('3 the teacher card offers "לדבר"', /לדבר/.test(await cardText('[data-quick=talk]')), await cardText('[data-quick=talk]'));
	await winner.page.click(tid('table-start'));
	await until(async () => (await tableDoc()).step === 'talk', 'table at talk');
	check('3 asked at toTalk: the asker is in askedUids', (await tableDoc()).askedUids?.includes(winner.uid));
	await winner.page.waitForSelector(`${tid('table-next-speaker')}:not([disabled])`, { timeout: TIMEOUT });
	check('3 B: the asker has four enabled chips, tablemates none', (await count(winner.page, `${tid('table-next-speaker')}:not([disabled])`)) === 4 && (await count(others[0].page, `${tid('table-next-speaker')}:not([disabled])`)) === 0);
	check('3 B: the screen is dark; a tablemate reads "listening"; no write button', (await isDown(others[0].page)) && /מקשיבים לשאלה/.test(await textOf(others[0].page, '.frame__instruction')) && !(await has(winner.page, 'table-to-write')));
	check('3 no class button and no write box at Table talk', (await count(winner.page, '.flow__class')) === 0 && (await count(winner.page, tid('answer-box'))) === 0);
	await winner.page.locator(tid('table-next-speaker')).nth(uids.indexOf(winner.uid)).click();
	await until(async () => (await tableDoc()).speakerUid === winner.uid, 'the asker calls herself');
	check('3 the asker may call herself', true);

	// 4. pass the minute -----------------------------------------------------------------------
	const mate = others[0];
	await winner.page.locator(tid('table-next-speaker')).nth(uids.indexOf(mate.uid)).click();
	await until(async () => (await tableDoc()).speakerUid === mate.uid, 'a tablemate speaks');
	await mate.page.waitForFunction(() => /התור שלכם לדבר/.test(document.querySelector('.talk__speaker')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('4 "pass my minute" is absent at the start of the minute', !(await has(mate.page, 'pass-speak')));
	await mate.page.waitForSelector(tid('pass-speak'), { timeout: TIMEOUT });
	check('4 it appears after about three seconds', true);
	await winner.page.waitForSelector(tid('pass-for'), { timeout: TIMEOUT });
	check('4 the asker has "לוותר בשם {name}" in the same slot', /לוותר בשם/.test(await textOf(winner.page, tid('pass-for'))), await textOf(winner.page, tid('pass-for')));
	check('4 nobody else has a pass control', !(await has(others[1].page, 'pass-speak')) && !(await has(others[1].page, 'pass-for')));
	await mate.page.click(tid('pass-speak'));
	await until(async () => (await tableDoc()).passedSpeakingUids?.includes(mate.uid), 'minute passed');
	for (const s of students) {
		await s.page.waitForSelector('.talk__chip[data-state=passed]', { timeout: TIMEOUT });
		const passed = await s.page.locator('.talk__chip[data-state=passed]').count();
		check(`4 ${s.name}: the passed chip shows "–" and a state`, passed === 1);
		await s.page.waitForSelector('[data-testid=time-over]', { timeout: TIMEOUT });
		check(`4 ${s.name}: C-prime, time over`, true);
	}
	check('4 C-prime: every chip is enabled on every phone', (await speakerChips(others[1].page)).every((c) => c.endsWith(':on')), (await speakerChips(others[1].page)).join());
	// the asker passes on behalf of a silent speaker
	const silent = others[1];
	await winner.page.locator(tid('table-next-speaker')).nth(uids.indexOf(silent.uid)).click();
	await until(async () => (await tableDoc()).speakerUid === silent.uid, 'a second tablemate speaks');
	await winner.page.waitForSelector(tid('pass-for'), { timeout: TIMEOUT });
	await winner.page.click(tid('pass-for'));
	await until(async () => (await tableDoc()).passedSpeakingUids?.includes(silent.uid), 'asker passed for the speaker');
	check('4 the asker\'s "pass for" passes the minute', true);
	// call the first passed speaker again: the chip turns spoken (E3-prime)
	await winner.page.locator(tid('table-next-speaker')).nth(uids.indexOf(mate.uid)).click();
	await until(async () => (await tableDoc()).speakerUid === mate.uid && !(await tableDoc()).passedSpeakingUids?.includes(mate.uid), 're-called');
	const states4 = await winner.page.locator('.talk__chip').evaluateAll((els) => els.map((e) => e.dataset.state));
	check('4 a re-called passed speaker\'s chip reads spoken, not passed', states4[uids.indexOf(mate.uid)] !== 'passed' && states4[uids.indexOf(silent.uid)] === 'passed', states4.join());

	// 5. everyone spoke: V2 ------------------------------------------------------------------------
	await setTable(v2());
	const notYet5 = students.filter((s) => s !== noa);
	for (const s of notYet5) await s.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	check('5 V2 stays on the dark frame on every phone', (await Promise.all(students.map((s) => isDown(s.page)))).every(Boolean));
	check('5 "כולם דיברו" in the countdown\'s place, no countdown', /כולם דיברו/.test(await textOf(noa.page, tid('all-spoke'))) && (await count(noa.page, '.count')) === 0, await textOf(noa.page, tid('all-spoke')));
	check('5 the asker\'s chip is done', (await askerStates(dana.page))[uids.indexOf(noa.uid)] === 'done', (await askerStates(dana.page)).join());
	check('5 three claim buttons, none on the asker\'s phone', (await Promise.all(students.map((s) => count(s.page, tid('table-claim'))))).join() === '1,0,1,1');
	check('5 the chips are a disabled reference', (await speakerChips(dana.page)).every((c) => c.endsWith(':off')));

	// 6. pass asking: one inline confirm -----------------------------------------------------------------
	await dana.page.click(tid('pass-ask'));
	await dana.page.waitForSelector(tid('pass-ask-yes'), { timeout: TIMEOUT });
	check('6 the confirm says "you won\'t ask this lesson" and keeps the claim enabled', /לא תשאלו בשיעור הזה/.test(await textOf(dana.page, '.claim-footer__confirm')) && (await dana.page.locator(tid('table-claim')).isEnabled()));
	await dana.page.click(tid('pass-ask-cancel'));
	await dana.page.waitForFunction(() => !document.querySelector('[data-testid=pass-ask-yes]'), null, { timeout: TIMEOUT });
	check('6 cancel keeps everything', !(await tableDoc()).passedAskingUids?.length && (await has(dana.page, 'pass-ask')));
	await dana.page.click(tid('pass-ask'));
	await dana.page.click(tid('pass-ask-yes'));
	await until(async () => (await tableDoc()).passedAskingUids?.includes(dana.uid), 'Dana passed');
	await dana.page.waitForFunction(() => !document.querySelector('[data-testid=table-claim]'), null, { timeout: TIMEOUT });
	for (const s of students) {
		await s.page.waitForFunction((i) => document.querySelectorAll('.askers__chip')[i]?.dataset.state === 'passed', uids.indexOf(dana.uid), { timeout: TIMEOUT });
	}
	check('6 Dana\'s chip is passed on every phone and her footer is gone', true);
	check('6 the header max drops by one (3)', /מתוך 3/.test(await textOf(omri.page, '.frame__header')), await textOf(omri.page, '.frame__header'));
	check('6 a polite line tells her', /ויתרתם על התור/.test(await dana.page.locator('.visually-hidden[aria-live=polite]').first().innerText()));

	// 7. the asker passes at A -----------------------------------------------------------------------------
	await setTable({ askerUid: noa.uid, questionId: seed.guidingIds[0], usedQuestionIds: [seed.guidingIds[0]] });
	await noa.page.waitForSelector(tid('pass-ask'), { timeout: TIMEOUT });
	await noa.page.click(tid('pass-ask'));
	await noa.page.click(tid('pass-ask-yes'));
	const afterA = await until(async () => ((await tableDoc()).askerUid === null ? await tableDoc() : null), 'back to V1');
	check('7 V1 for all: nobody asks, her question is free, her chip is passed', afterA.passedAskingUids?.includes(noa.uid) && !afterA.questionId && afterA.usedQuestionIds.length === 0);
	await omri.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	check('7 the others read the volunteer line and have a claim', /מי רוצה לשאול ראשון/.test(await textOf(omri.page, '.frame__instruction')));

	// 8. the last student ---------------------------------------------------------------------------------------
	await setTable(v2({ askedUids: [noa.uid, dana.uid, omri.uid], turn: 4 }));
	await lior.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	check('8 only Lior has the claim, reading "your turn to ask"', (await Promise.all(students.map((s) => count(s.page, tid('table-claim'))))).join() === '0,0,0,1' && /התור שלכם לשאול/.test(await textOf(lior.page, '.talk__over-ask')), await textOf(lior.page, '.talk__over-ask'));
	check('8 the others read "waiting for Lior"', /ממתינים לLior|ממתינים ל-?Lior/.test(await textOf(dana.page, '.talk__over-ask')), await textOf(dana.page, '.talk__over-ask'));
	check('8 the card waits for Lior and offers "להתחיל סבב 5"', /ממתינים ל/.test(await cardText('.table-card__wait')) && /Lior/.test(await cardText('.table-card__wait')) && /סבב 5/.test(await cardText('[data-quick=turn]')), await cardText('.table-card__wait'));

	// 9. done ---------------------------------------------------------------------------------------------------------
	await lior.page.click(tid('pass-ask'));
	await lior.page.click(tid('pass-ask-yes'));
	await until(async () => (await tableDoc()).passedAskingUids?.includes(lior.uid), 'Lior passed');
	for (const s of students) await s.page.waitForFunction(() => /סיימתם את הסבבים/.test(document.querySelector('.frame__header')?.textContent ?? ''), null, { timeout: TIMEOUT });
	for (const s of students) {
		check(`9 ${s.name}: paper, done header, "wait for the other tables", no strip, no footer`,
			!(await isDown(s.page)) && /חכו לשאר השולחנות/.test(await textOf(s.page, '.frame__instruction')) && (await count(s.page, '.substeps')) === 0 && (await count(s.page, '.frame__action')) === 0);
	}
	check('9 the card: "כולם סיימו" and "שאלו 3 · ויתרו 1", no quick button', /כולם סיימו/.test(await cardText('.table-card__now')) && /שאלו 3 · ויתרו 1/.test(await cardText('.table-card__wait')) && (await count(tpage, `${card} [data-quick]`)) === 0, `${await cardText('.table-card__now')} / ${await cardText('.table-card__wait')}`);

	// 10. all pass at V1 ----------------------------------------------------------------------------------------------------
	await setTable();
	for (const s of students) await s.page.waitForSelector(tid('pass-ask'), { timeout: TIMEOUT });
	for (const s of students) {
		await s.page.click(tid('pass-ask'));
		await s.page.click(tid('pass-ask-yes'));
		await until(async () => (await tableDoc()).passedAskingUids?.includes(s.uid), `${s.name} passed`);
	}
	for (const s of students) await s.page.waitForFunction(() => /סיימתם את הסבבים/.test(document.querySelector('.frame__header')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('10 done at once: every chip passed', (await askerStates(omri.page)).every((x) => x === 'passed'), (await askerStates(omri.page)).join());
	check('10 the card says "שאלו 0 · ויתרו 4"', /שאלו 0 · ויתרו 4/.test(await cardText('.table-card__wait')), await cardText('.table-card__wait'));

	// 11. the teacher opens V1 ---------------------------------------------------------------------------------------------------
	await setTable(v2());
	await tpage.waitForSelector(`${card} [data-quick=turn]`, { timeout: TIMEOUT });
	check('11 the card button reads "להתחיל סבב 2"', /להתחיל סבב 2/.test(await cardText('[data-quick=turn]')), await cardText('[data-quick=turn]'));
	await tpage.locator(`${card} [data-quick=turn]`).click();
	const opened = await until(async () => ((await tableDoc()).turn === 2 ? await tableDoc() : null), 'teacher opened turn 2');
	check('11 V1 for the next turn: no asker, step pick, turn 2', opened.askerUid === null && opened.step === 'pick');
	await dana.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT }).catch(() => undefined);
	await tpage.locator(`${card} .table-card__title`).click();
	await tpage.waitForSelector('.table-sheet', { timeout: TIMEOUT });
	const verbs = await tpage.locator('.table-sheet__actions [data-quick]').evaluateAll((els) => els.map((e) => e.dataset.quick));
	check('11 the sheet step row is "לדבר · להתחיל סבב n"', verbs.join() === 'talk,turn', verbs.join());
	check('11 the sheet offers "להעביר את התור ל…" and "לוותר על התור בשם …" per not-yet member', (await count(tpage, tid('sheet-pass-asker'))) >= 3 && (await count(tpage, tid('sheet-pass-ask'))) >= 3);
	await tpage.locator(`.table-sheet__member:has-text("Lior") ${tid('sheet-pass-asker')}`).click();
	await until(async () => (await tableDoc()).askerUid === lior.uid, 'the teacher gave the turn to Lior');
	check('11 "להעביר את התור לליאור" makes Lior the asker', true);
	await tpage.locator('.table-sheet__close').click();

	// 12. peek -----------------------------------------------------------------------------------------------------------------------------
	await setTable(v2());
	await dana.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	await dana.page.locator('.substeps__pill[data-step=pick]').click();
	await dana.page.waitForSelector(tid('peek-body'), { timeout: TIMEOUT });
	const peekOn = await count(dana.page, `${tid('peek-body')} :is(button,input,textarea,select):not(:disabled)`);
	check('12 the peeked list has every control disabled and the frame stays dark', peekOn === 0 && (await isDown(dana.page)));
	check('12 no claim and no pass while peeking; the one live control is "חזרה לעכשיו"', !(await has(dana.page, 'table-claim')) && !(await has(dana.page, 'pass-ask')) && /חזרה לעכשיו/.test(await textOf(dana.page, tid('peek-back'))));
	check('12 one line says what the table does now', /בשלב הדיבור/.test(await textOf(dana.page, '.frame__instruction')), await textOf(dana.page, '.frame__instruction'));
	await dana.page.click(tid('peek-back'));
	await dana.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	check('12 "back to now" returns to the claim', true);
	await dana.page.locator('.substeps__pill[data-step=pick]').click();
	await dana.page.waitForSelector(tid('peek-body'), { timeout: TIMEOUT });
	await tableRef.set({ ...baseTable(), turn: 2 });
	await dana.page.waitForFunction(() => !document.querySelector('[data-testid=peek-body]'), null, { timeout: TIMEOUT });
	check('12 the phone jumps to the official screen when the official step changes', true);

	// 13. the teacher's questions run out ------------------------------------------------------------------------------------------------------
	await setTable({ askerUid: omri.uid, usedQuestionIds: seed.guidingIds, askedUids: [noa.uid, dana.uid, lior.uid], turn: 4 });
	await omri.page.waitForSelector(tid('own-question-input'), { timeout: TIMEOUT });
	check('13 the note and the open own-question box (focused) for the asker', (await has(omri.page, 'questions-used')) && (await omri.page.evaluate(() => document.activeElement?.dataset?.testid)) === 'own-question-input');
	check('13 "בחרנו, לדבר" is disabled while the box is empty', await omri.page.locator(tid('table-start')).isDisabled());
	check('13 the others read "turn to write a question"', /לכתוב שאלה/.test(await textOf(dana.page, '.frame__instruction')), await textOf(dana.page, '.frame__instruction'));
	check('13 the teacher\'s questions are a collapsed list, not tappable', (await has(omri.page, 'used-questions')) && (await count(omri.page, tid('table-pick-question'))) === 0);
	await omri.page.fill(tid('own-question-input'), 'השאלה שלנו על חברות');
	await omri.page.waitForFunction(() => !document.querySelector('[data-testid=table-start]')?.disabled, null, { timeout: TIMEOUT });
	await omri.page.click(tid('table-start'));
	const own = await until(async () => ((await tableDoc()).step === 'talk' ? await tableDoc() : null), 'own question to talk');
	check('13 one tap reaches talk with the own question used', !seed.guidingIds.includes(own.questionId) && own.usedQuestionIds.includes(own.questionId) && own.askedUids.includes(omri.uid));
	await dana.page.waitForFunction(() => /השאלה שלנו על חברות/.test(document.querySelector('.talk__prompt')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('13 the own question is on every phone', true);
	await setTable({ askerUid: omri.uid, usedQuestionIds: [seed.guidingIds[0]] });
	const forgedPick = await callStep(omri.uid, { action: 'pickQuestion', questionId: seed.guidingIds[0] });
	check('13 a forged pick of a used question is refused', forgedPick.status === 'FAILED_PRECONDITION', JSON.stringify(forgedPick));

	// 14. forged and paused ---------------------------------------------------------------------------------------------------------------------------
	await setTable(v2({ passedAskingUids: [dana.uid], askedUids: [noa.uid] }));
	const asked = await callStep(noa.uid, { action: 'nextTurn', fromTurn: 1 });
	check('14 a claim by someone who asked: already-asked', asked.status === 'PERMISSION_DENIED' && asked.reason === 'already-asked', JSON.stringify(asked));
	const passedClaim = await callStep(dana.uid, { action: 'nextTurn', fromTurn: 1 });
	check('14 a claim by someone who passed: already-passed', passedClaim.status === 'PERMISSION_DENIED' && passedClaim.reason === 'already-passed', JSON.stringify(passedClaim));
	await setTable({ ...v2({ spokenUids: [noa.uid] }), speakerUid: omri.uid, speakerEndsAt: Date.now() + 30000 });
	const early = await callStep(lior.uid, { action: 'nextTurn', fromTurn: 1 });
	check('14 a claim at talk before everyone spoke: talk-not-over', early.status === 'FAILED_PRECONDITION' && early.reason === 'talk-not-over', JSON.stringify(early));
	const notSpeaker = await callStep(lior.uid, { action: 'passSpeaking' });
	check('14 passSpeaking by a tablemate: not-speaker', notSpeaker.status === 'PERMISSION_DENIED' && notSpeaker.reason === 'not-speaker', JSON.stringify(notSpeaker));
	await setTable();
	await mainRef.update({ 'statementSettings.lessonPlan.status': 'paused' });
	const pausedClaim = await callStep(dana.uid, { action: 'nextTurn', fromTurn: 1 });
	const pausedPass = await callStep(dana.uid, { action: 'passAsking' });
	await setTable({ ...v2({ spokenUids: [noa.uid] }), speakerUid: omri.uid, speakerEndsAt: Date.now() + 30000 });
	const pausedMinute = await callStep(omri.uid, { action: 'passSpeaking' });
	await mainRef.update({ 'statementSettings.lessonPlan.status': 'live' });
	check('14 while paused, the claim, both passes are refused', ![pausedClaim, pausedPass, pausedMinute].some((r) => r.ok), JSON.stringify([pausedClaim, pausedPass, pausedMinute]));

	// 15. reduced motion + axe -------------------------------------------------------------------------------------------------------------------------------
	await dana.page.emulateMedia({ reducedMotion: 'reduce' });
	const axe = async (label) => {
		// colour transitions in flight would be measured half-way: let them end first
		await dana.page.evaluate(async () => {
			await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		});
		await dana.page.addScriptTag({ content: axeSource });
		const found = await dana.page.evaluate(async () => {
			const r = await window.axe.run('.frame', { runOnly: ['wcag2a', 'wcag2aa'] });

			return r.violations.map(
				(v) => `${v.id}:${v.nodes.length}:${v.nodes.map((n) => `${n.target.join(' ')}=${n.any[0]?.message ?? ''}`).join('|')}`,
			);
		});
		const frameClass = await dana.page.locator('.frame').first().getAttribute('class');
		check(`15 axe: ${label}`, found.length === 0, found.length ? `${frameClass} ${found.join(',')}` : '');
	};
	await setTable();
	await dana.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	await axe('V1');
	await setTable({ askerUid: dana.uid });
	await dana.page.waitForSelector(tid('pass-ask'), { timeout: TIMEOUT });
	await axe('A');
	await setTable({ ...v2({ spokenUids: [noa.uid] }), speakerUid: dana.uid, speakerEndsAt: Date.now() + 30000, askedUids: [noa.uid] });
	await dana.page.waitForSelector('.count', { timeout: TIMEOUT });
	await axe('C');
	await setTable(v2());
	await dana.page.waitForSelector(tid('all-spoke'), { timeout: TIMEOUT });
	const noAnimation = await dana.page.locator('.talk__over').evaluate((el) => getComputedStyle(el).animationName);
	check('15 reduced motion: the V2 words run no animation', noAnimation === 'none', noAnimation);
	await axe('V2');
	await setTable({ passedAskingUids: uids });
	await dana.page.waitForFunction(() => /סיימתם את הסבבים/.test(document.querySelector('.frame__header')?.textContent ?? ''), null, { timeout: TIMEOUT });
	await axe('done');

	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
	console.error('e2e-table-turn aborted', e);
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
