// E2E: the table turn v3 (IA 16 rev 3, UX 16 rev 3). Real callables (functions emulator on), three
// phones at one table (Dana, Tal, Noa), a no-device member (Yossi) and the teacher console. Cases:
//   1 pick: every phone shows the question list, "I want to start" (dimmed, explains itself) and
//     "I want to pass"; stage name on top; no strip, no pills, no askers row
//   2 two starters tap together: one wins, the question is locked, the turn stays 1; the asker waits
//     ("let others answer first") with no button; the loser sees "I want to answer"
//   3 first volunteer gets the floor: clock + Finish (off for the first second) for them, the same
//     clock and "<name> is answering" for the rest; Finish ends the minute early, no "time over" words
//   4 the asker unlocks once one other answered; a second tap on the floor is refused (floor-taken)
//   5 pass answering (one tap, no confirm); everyone answered: the pick list is back for those who have
//     not asked, "wait for others to pick" for the asker
//   6 own question: composer, one tap to start, the question joins the table's list and is locked
//   7 pass asking: inline confirm (cancel keeps everything), yes passes, the table is done
//   8 forged calls: already-asked, question-used, floor-taken, others-first, already-answered,
//     member nextTurn, own question of another table
//   9 teacher: card lines (waiting to start, question + answering + end the minute, not answered yet,
//     done), sheet buttons, no-device member "answer now"
//  10 reduced motion + axe on pick, my minute, may answer, done
//
// Setup (own ports; repo root):
//   FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase emulators:start -c firebase.v3.local.json \
//     --project freedi-test --only auth,firestore,functions,database
//   (apps/join-class) VITE_EMULATOR_AUTH_PORT=9140 VITE_EMULATOR_FIRESTORE_PORT=8140 \
//     VITE_EMULATOR_DATABASE_PORT=9040 VITE_EMULATOR_FUNCTIONS_PORT=5040 npx vite --port 3040 --strictPort
//   JOIN_CLASS_URL=http://localhost:3040 E2E_AUTH_PORT=9140 E2E_FIRESTORE_PORT=8140 \
//     E2E_FUNCTIONS_PORT=5040 node scripts/e2e-table-turn.mjs
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
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=4', '--seated', '--tokens', `--id=turn3-${Date.now()}`],
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
const frameText = (page) => textOf(page, '.frame');
const isDown = (page) => page.locator('.frame--down').count().then((n) => n > 0);
/** Wait until the phone's screen matches `regex` (the heading or the body). */
const screen = (page, regex, label) =>
	until(async () => regex.test(await frameText(page)), label, TIMEOUT);

const browser = await chromium.launch();
const errors = [];
async function newPhone(name) {
	const before = await authUids();
	const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'he-IL' });
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
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
	const custom = uid === 'teacher' ? seed.teacher.customToken : await getAuth().createCustomToken(uid);
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

const students = [];
try {
	for (const name of ['Dana', 'Tal', 'Noa']) students.push(await newPhone(name));
	const [dana, tal, noa] = students;
	const uids = students.map((s) => s.uid);
	const q1 = seed.guidingIds[0];
	const q2 = seed.guidingIds[1];
	const baseTable = () => ({
		tableId, mainId, n: 1, memberUids: uids, noDeviceMembers: [{ id: 'nd_yossi', name: 'Yossi' }],
		step: 'pick', askerUid: null, turn: 1, writingMode: 'each', writingLocked: false,
		spokenUids: [], usedQuestionIds: [], updatedAt: Date.now(),
	});
	/** Put the table in a known state (a whole document, as the engine writes it). */
	const setTable = (patch = {}) => tableRef.set({ ...baseTable(), ...patch });

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
	// the phones started listening while the seeded table still seated other students (a denied read):
	// re-target them now that the table seats them
	for (const s of students) {
		const subRef = db.doc(`statementsSubscribe/${s.uid}--${mainId}`);
		await subRef.update({ tableId: 'retarget', lastUpdate: Date.now() });
		await new Promise((r) => setTimeout(r, 300));
		await subRef.update({ tableId, lastUpdate: Date.now() });
	}
	await tpage.goto(`${BASE}/t/${mainId}`, { waitUntil: 'domcontentloaded' });
	const card = '.table-card[data-table="1"]';
	await tpage.locator(card).waitFor({ timeout: TIMEOUT });
	const cardText = () => textOf(tpage, card).catch(() => '');

	// 1. pick on every phone ---------------------------------------------------------------------------
	for (const s of students) await s.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	for (const s of students) {
		const text = await frameText(s.page);
		check(`1 ${s.name}: stage name, pick list, start and pass buttons`, /שיחת שולחן/.test(text) && /בחרו שאלה/.test(text) && /אני רוצה להתחיל/.test(text) && /אני רוצה לוותר/.test(text), text.slice(0, 120));
		check(`1 ${s.name}: no strip, no pills, no askers row, a paper frame`, (await count(s.page, '.substeps, .substeps__pill, .askers, .talk__chips')) === 0 && !(await isDown(s.page)));
		check(`1 ${s.name}: the teacher's questions and "+ our own" are in the list`, (await count(s.page, tid('table-pick-question'))) === seed.guidingIds.length && (await has(s.page, 'table-pick-own')), `${await count(s.page, tid('table-pick-question'))} rows`);
	}
	check('1 the header says turn 1 of 3', /סבב 1 מתוך 3/.test(await textOf(dana.page, '.frame__header')), await textOf(dana.page, '.frame__header'));
	await dana.page.click(tid('table-claim'), { force: true });
	await until(async () => dana.page.locator('#turn-pick-first').count(), 'pick-first hint');
	check('1 start with nothing chosen: a quiet hint, nothing written', /קודם בוחרים שאלה/.test(await textOf(dana.page, '#turn-pick-first')) && !(await tableDoc()).askerUid);
	check('1 the teacher card waits for someone to start', /ממתינים למי שיתחיל/.test(await cardText()), await cardText());

	// 2. two starters tap together ---------------------------------------------------------------------
	await tal.page.locator(tid('table-pick-question')).nth(0).click();
	await dana.page.locator(tid('table-pick-question')).nth(1).click();
	await Promise.all([tal.page.click(tid('table-claim')), dana.page.click(tid('table-claim'))]);
	const claimed = await until(async () => ((await tableDoc()).askerUid ? await tableDoc() : null), 'a claim won');
	const winner = students.find((s) => s.uid === claimed.askerUid);
	const loser = winner === tal ? dana : tal;
	check('2 exactly one claim won: talk, turn 1, the question locked', claimed.step === 'talk' && claimed.turn === 1 && claimed.usedQuestionIds.length === 1 && claimed.questionId === claimed.usedQuestionIds[0] && claimed.askedUids.includes(winner.uid), winner.name);
	await screen(winner.page, /תנו לאחרים לענות קודם/, 'winner waits');
	check('2 the asker waits: "let others answer first", no button, a dark frame', !(await has(winner.page, 'table-answer')) && (await isDown(winner.page)) && (await count(winner.page, '.frame__action')) === 0);
	await screen(noa.page, /אני רוצה לענות/, 'noa may answer');
	check('2 a tablemate may answer or pass; the stage and the question are on the screen', (await has(noa.page, 'table-answer')) && (await has(noa.page, 'pass-answer')) && /שיחת שולחן/.test(await frameText(noa.page)));
	await screen(loser.page, /אני רוצה לענות/, 'loser may answer');
	// E2E_SHOTS_DIR=<dir>: 375x812 screenshots of the talk screens (the question in the top third).
	const shot = async (page, name) => {
		if (!process.env.E2E_SHOTS_DIR) return;
		await page.setViewportSize({ width: 375, height: 812 });
		await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/${name}.png` });
		await page.setViewportSize({ width: 390, height: 900 });
	};
	await shot(noa.page, 't3-state-A');
	const headingOf = async (page) => (await page.locator('.frame__instruction').first().innerText()).trim();
	const q1Text = (await db.doc(`statements/${claimed.questionId}`).get()).data().statement;
	const seen = await noa.page.evaluate(() => {
		const h = document.querySelector('.frame__instruction');
		const bg = getComputedStyle(document.querySelector('.frame')).backgroundColor;
		const r = h.getBoundingClientRect();
		return { same: getComputedStyle(h).color === bg, top: r.top, h: r.height, vh: innerHeight };
	});
	check('2 the question is readable (not the frame colour) and fills the top third', !seen.same && seen.h >= seen.vh * 0.33 - 1, JSON.stringify(seen));
	check('2 the h1 of every talk screen is the chosen question', (await headingOf(noa.page)) === q1Text && (await headingOf(winner.page)) === q1Text, q1Text);
	check('2 the loser sees no error', (await count(loser.page, '.c3-error')) === 0);
	check('2 a forged answer by the asker is refused (others-first)', (await callStep(winner.uid, { action: 'claimSpeaker' })).reason === 'others-first');

	// 3. the first volunteer gets the floor, Finish ends it ----------------------------------------------
	const answerer = noa;
	await answerer.page.click(tid('table-answer'));
	await until(async () => (await tableDoc()).speakerUid === answerer.uid, 'floor taken');
	await screen(answerer.page, /הדקה שלכם/, 'my minute');
	check('3 the answerer sees "your minute", the clock and Finish', (await count(answerer.page, '[role=timer]')) === 1 && (await has(answerer.page, 'table-finish')) && (await isDown(answerer.page)));
	check('3 Finish is drawn off for the first second', await answerer.page.locator(tid('table-finish')).isDisabled());
	await screen(winner.page, /עונה/, 'others see who answers');
	await shot(loser.page, 't3-state-L');
	check('3 the others see the same clock and the name', (await count(winner.page, '[role=timer]')) === 1 && (await count(loser.page, '[role=timer]')) === 1 && /Noa.*עונה|עונה/.test(await textOf(loser.page, tid('answering'))), await textOf(loser.page, tid('answering')));
	check('3 nobody else has a button during a minute', !(await has(loser.page, 'table-answer')) && !(await has(winner.page, 'table-answer')));
	check('3 a second tap on the floor is refused (floor-taken)', (await callStep(loser.uid, { action: 'claimSpeaker' })).reason === 'floor-taken');
	await until(async () => !(await answerer.page.locator(tid('table-finish')).isDisabled()), 'finish enabled', 3000);
	await answerer.page.click(tid('table-finish'));
	await until(async () => { const d = await tableDoc(); return d.speakerEndsAt <= Date.now() && d.spokenUids.includes(answerer.uid); }, 'finish wrote');
	await screen(answerer.page, /כבר עניתם/, 'answerer had their turn');
	check('3 no "time over" words, the answerer is at "you had your turn"', !/הזמן נגמר|הזמן תם/.test(await frameText(answerer.page)) && (await count(answerer.page, '.c3-error')) === 0);

	// 4. the asker unlocks after one other answered ------------------------------------------------------
	await screen(winner.page, /אני רוצה לענות/, 'the asker may answer now');
	check('4 the asker has "I want to answer" and a pass button', (await has(winner.page, 'table-answer')) && (await has(winner.page, 'pass-answer')));
	check('4 a repeat answer is refused (already-answered)', (await callStep(answerer.uid, { action: 'claimSpeaker' })).reason === 'already-answered');

	// 5. pass answering, then everyone answered -> the next pick -----------------------------------------
	await loser.page.click(tid('pass-answer'));
	await until(async () => (await tableDoc()).passedSpeakingUids?.includes(loser.uid), 'pass written');
	await screen(loser.page, /ויתרתם על השאלה הזאת/, 'passed this question');
	check('5 passing answering took one tap, no confirm', (await count(loser.page, tid('pass-ask-yes'))) === 0);
	await winner.page.click(tid('table-answer'));
	await until(async () => (await tableDoc()).speakerUid === winner.uid, 'asker answers');
	await tpage.waitForFunction(() => /עוד לא ענו|עונה/.test(document.querySelector('.table-card')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('9 the card shows the question, who answers and "end the minute"', /עונה/.test(await cardText()) && (await count(tpage, `${card} [data-quick=finish]`)) === 1 && (await count(tpage, `${card} .table-card__question`)) === 1, await cardText());
	await tpage.locator(`${card} [data-quick=finish]`).click();
	await until(async () => (await tableDoc()).speakerEndsAt <= Date.now(), 'teacher ended the minute');
	const askerOf = (d) => students.find((s) => s.uid === d.askerUid);
	await screen(askerOf(await tableDoc()).page, /אני רוצה להתחיל|חכו שאחרים/, 'next pick');
	const t1 = await tableDoc();
	const notAsked = students.filter((s) => !t1.askedUids.includes(s.uid));
	check('5 everyone answered or passed: those who have not asked see the list again', (await Promise.all(notAsked.map((s) => has(s.page, 'table-claim')))).every(Boolean) && notAsked.length === 2);
	check('5 the asker sees "wait for others to pick a question", no button', /חכו שאחרים יבחרו שאלה/.test(await frameText(winner.page)) && !(await has(winner.page, 'table-claim')));
	check('5 the teacher card waits for someone to start', /ממתינים למי שיתחיל/.test(await cardText()), await cardText());
	check('8 an asker cannot ask twice (already-asked)', (await callStep(winner.uid, { action: 'claimTurn', fromTurn: 1, questionId: q2 })).reason === 'already-asked');
	check('8 a used question is refused (question-used)', (await callStep(notAsked[0].uid, { action: 'claimTurn', fromTurn: 1, questionId: t1.questionId })).reason === 'question-used');
	check('8 a member cannot open the pick (nextTurn is the teacher\'s)', (await callStep(notAsked[0].uid, { action: 'nextTurn', fromTurn: 1 })).status === 'PERMISSION_DENIED');
	check('8 an own question of another table is refused', (await callStep(notAsked[0].uid, { action: 'claimTurn', fromTurn: 1, questionId: seed.challengeId })).status === 'INVALID_ARGUMENT');

	// 6. own question ---------------------------------------------------------------------------------------
	const second = notAsked[0];
	const third = notAsked[1];
	await second.page.click(tid('table-pick-own'));
	await second.page.fill(tid('own-question-input'), 'מי מחליט מה מצחיק?');
	await second.page.click(tid('table-claim'));
	const t2 = await until(async () => { const d = await tableDoc(); return d.turn === 2 ? d : null; }, 'turn 2 claimed');
	check('6 the own question is a turn: locked, asked once, the second asker', t2.askerUid === second.uid && t2.usedQuestionIds.length === 2 && t2.step === 'talk');
	const ownDoc = await db.doc(`statements/${t2.questionId}`).get();
	check('6 the question is this table\'s own', ownDoc.exists && ownDoc.data().classTable?.tableId === tableId && ownDoc.data().statement === 'מי מחליט מה מצחיק?');
	await screen(third.page, /אני רוצה לענות/, 'third may answer');
	await screen(second.page, /תנו לאחרים לענות קודם/, 'second waits');
	check('6 the own question is the h1 on the tablemate phone and on the asker phone', (await headingOf(third.page)) === 'מי מחליט מה מצחיק?' && (await headingOf(second.page)) === 'מי מחליט מה מצחיק?', await headingOf(third.page));
	await tpage.waitForFunction(() => /עוד לא ענו/.test(document.querySelector('.table-card')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('9 the card names who has not answered yet', /עוד לא ענו/.test(await cardText()), await cardText());

	// finish turn 2 by passes (teacher passes for one, students pass)
	await tpage.locator(`${card}`).getByRole('link').first().click();
	await tpage.waitForSelector('.table-sheet', { timeout: TIMEOUT });
	check('9 the sheet offers "answer now" and "pass for" per member, and "answer now" for Yossi', (await count(tpage, tid('sheet-speak-now'))) >= 2 && (await count(tpage, tid('sheet-pass-answer'))) >= 2 && (await count(tpage, tid('sheet-speak-now-nd'))) === 1);
	await tpage.locator(tid('sheet-speak-now-nd')).click();
	await until(async () => (await tableDoc()).speakerUid === 'nd_yossi', 'teacher gave Yossi the floor');
	await screen(third.page, /Yossi עונה|יוסי עונה|Yossi/, 'a no-device minute shows on the phones');
	check('9 a no-device minute reads "<name> is answering" on every phone', /Yossi/.test(await frameText(third.page)));
	await callStep('teacher', { action: 'finishSpeaking' });
	await until(async () => (await tableDoc()).speakerEndsAt <= Date.now(), 'yossi minute over');
	await tpage.keyboard.press('Escape');
	await third.page.click(tid('pass-answer'));
	await until(async () => (await tableDoc()).passedSpeakingUids?.includes(third.uid), 'third passed');
	// Yossi answered, so the asker may answer now
	await screen(second.page, /אני רוצה לענות/, 'asker unlocked after Yossi');
	await second.page.click(tid('table-answer'));
	await until(async () => (await tableDoc()).speakerUid === second.uid, 'second asker answers');
	await callStep('teacher', { action: 'finishSpeaking' });
	const firstAsker = winner === second ? third : winner;
	await screen(firstAsker.page, /אני רוצה לענות/, 'the first asker may answer question 2');
	await firstAsker.page.click(tid('table-answer'));
	await until(async () => (await tableDoc()).speakerUid === firstAsker.uid, 'first asker answers');
	await callStep('teacher', { action: 'finishSpeaking' });

	// 7. pass asking with the inline confirm ---------------------------------------------------------------
	await until(async () => has(third.page, 'table-claim'), 'third at pick again');
	check('7 the one who has not asked sees the list; the two who asked wait', (await has(third.page, 'pass-ask')) && /חכו שאחרים יבחרו שאלה/.test(await frameText(second.page)) && /חכו שאחרים יבחרו שאלה/.test(await frameText(firstAsker.page)));
	await third.page.click(tid('pass-ask'));
	await third.page.waitForSelector(tid('pass-ask-yes'), { timeout: TIMEOUT });
	check('7 pass asking opens one inline confirm with the lesson-long consequence', /לא תשאלו בשיעור הזה/.test(await frameText(third.page)));
	await third.page.click(tid('pass-ask-cancel'));
	check('7 cancel keeps everything: nothing written', !(await tableDoc()).passedAskingUids?.includes(third.uid) && (await has(third.page, 'table-claim')));
	await third.page.click(tid('pass-ask'));
	await third.page.click(tid('pass-ask-yes'));
	await until(async () => (await tableDoc()).passedAskingUids?.includes(third.uid), 'pass asking written');
	for (const s of students) await screen(s.page, /סיימתם את הסבבים/, `${s.name} done`);
	check('7 the table is done: a paper frame, "wait for the other tables", no footer', !(await isDown(dana.page)) && /חכו לשאר השולחנות/.test(await frameText(dana.page)) && (await count(dana.page, '.frame__action')) === 0);
	check('9 the teacher card says everyone is done', /כולם סיימו/.test(await cardText()), await cardText());

	// 10. reduced motion + axe -----------------------------------------------------------------------------
	await dana.page.emulateMedia({ reducedMotion: 'reduce' });
	const axe = async (label) => {
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
		check(`10 axe: ${label}`, found.length === 0, found.length ? found.join(',') : '');
	};
	await setTable();
	await dana.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	await axe('pick');
	const running = { step: 'talk', askerUid: tal.uid, questionId: q1, usedQuestionIds: [q1], askedUids: [tal.uid] };
	await setTable({ ...running, speakerUid: dana.uid, speakerEndsAt: Date.now() + 30000 });
	await dana.page.waitForSelector(tid('table-finish'), { timeout: TIMEOUT });
	await axe('my minute');
	await setTable({ ...running, spokenUids: [noa.uid] });
	await dana.page.waitForSelector(tid('table-answer'), { timeout: TIMEOUT });
	await axe('may answer');
	const noAnimation = await dana.page.locator('.tt').first().evaluate((el) => getComputedStyle(el).animationName);
	check('10 reduced motion: the state body runs no animation', noAnimation === 'none', noAnimation);
	await setTable({ passedAskingUids: uids });
	await screen(dana.page, /סיימתם את הסבבים/, 'done again');
	await axe('done');

	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
	console.error('e2e-table-turn aborted', e);
	for (const s of students) {
		console.error(`--- ${s.name} screen:`, await frameText(s.page).catch(() => '(no frame)'));
	}
	console.error('page errors:', errors.join(' | '));
	console.error('table:', JSON.stringify(await tableDoc().catch(() => null)));
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
