// E2E: the table turn (UX 16). Real callables (functions emulator on), four phones at one table
// and the teacher console.
//  1. the askers row on every phone; the strip is a peek: a non-official screen has every control
//     disabled, a line says what the table does now, "back to now" returns, and the phone jumps to
//     the official step when it changes; the official pill says "now".
//  2. turn 1 by the asker: pick (live on the other phones) -> talk (only the asker's chips) -> write
//     -> rate.
//  3. the hand-off: the not-yet students have the card, the asker has none; two students claim at
//     once (one wins, the loser sees no error); a forged claim by someone who already asked is
//     refused (already-asked).
//  4. turn 3 reaches the last student (card "your turn to ask"); turn 4 is everyone asked: no card,
//     no control, "wait for the other tables".
//  5. the teacher's card shows "turn n of max", the one next-step button gives the turn to the first
//     student who has not asked in seating order; a teacher's next turn is refused when all asked.
//
// Setup (own ports; repo root):
//   npx firebase emulators:start -c firebase.turn.local.json --project freedi-test --only auth,firestore,functions,database
//   (apps/join-class) VITE_EMULATOR_AUTH_PORT=9138 VITE_EMULATOR_FIRESTORE_PORT=8138 \
//     VITE_EMULATOR_DATABASE_PORT=9038 VITE_EMULATOR_FUNCTIONS_PORT=5038 npx vite --port 3038 --strictPort
//   JOIN_CLASS_URL=http://localhost:3038 E2E_AUTH_PORT=9138 E2E_FIRESTORE_PORT=8138 \
//     E2E_FUNCTIONS_PORT=5038 node scripts/e2e-table-turn.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
execFileSync(
	'npx',
	[
		'tsx',
		'apps/join-class/scripts/seed-classroom.ts',
		'--step=4',
		'--seated',
		'--tokens',
		`--id=turn-${Date.now()}`,
	],
	{ cwd: join(here, '..', '..', '..'), env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId } = seed;
const tableId = `${mainId}--1`;

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
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`timed out: ${label}`);
}
const authUids = async () => new Set((await getAuth().listUsers(1000)).users.map((u) => u.uid));
const tid = (id) => `[data-testid=${id}]`;
const tableDoc = async () => (await tableRef.get()).data();
const textOf = async (page, selector) =>
	((await page.locator(selector).first().innerText()) ?? '').replace(/\s+/g, ' ').trim();
const has = async (page, id) => (await page.locator(tid(id)).count()) > 0;

const browser = await chromium.launch();
const errors = [];
async function newStudent(name) {
	const before = await authUids();
	const context = await browser.newContext({
		viewport: { width: 390, height: 900 },
		locale: 'he-IL',
	});
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
	const uid = await until(
		async () => [...(await authUids())].find((id) => !before.has(id)),
		`${name} uid`,
	);
	const subRef = db.doc(`statementsSubscribe/${uid}--${mainId}`);
	await until(async () => (await subRef.get()).exists, `${name} subscription`);
	await subRef.update({
		tableId,
		side: 20,
		camp: 'a',
		'user.displayName': name,
		lastUpdate: Date.now(),
	});

	return { page, uid, name, context };
}

/** Sign in at the auth emulator as `uid` and call classTableStep over HTTP, as a forged client could. */
async function callStep(uid, body) {
	const custom = await getAuth().createCustomToken(uid);
	const signIn = await fetch(
		`http://localhost:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: custom, returnSecureToken: true }),
		},
	);
	const { idToken } = await signIn.json();
	const res = await fetch(
		`http://localhost:${FUNCTIONS_PORT}/${PROJECT}/me-west1/classTableStep`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
			body: JSON.stringify({ data: { tableId, ...body } }),
		},
	);
	const json = await res.json();

	return json.error ? { status: json.error.status, reason: json.error.details?.reason } : { ok: true };
}


try {
	const students = [];
	for (const name of ['Dana', 'Noa', 'Omri', 'Lior']) students.push(await newStudent(name));
	const [dana, noa, omri, lior] = students;
	const byUid = new Map(students.map((s) => [s.uid, s]));
	await tableRef.set({
		tableId, mainId, n: 1, memberUids: students.map((s) => s.uid), noDeviceMembers: [],
		step: 'pick', askerUid: dana.uid, turn: 1, writingMode: 'each', writingLocked: false,
		spokenUids: [], usedQuestionIds: [], updatedAt: Date.now(),
	});

	// 1. askers row on every phone ------------------------------------------------
	for (const s of students) await s.page.waitForSelector(tid('askers-row'), { timeout: TIMEOUT });
	for (const s of students) {
		const states = await s.page.locator('.askers__chip').evaluateAll((els) => els.map((e) => e.dataset.state));
		check(`${s.name}: askers row = now, wait, wait, wait`, states.join() === 'now,wait,wait,wait', states.join());
	}
	const noaLine = await textOf(noa.page, '.flow__asker');
	check('a tablemate reads whose turn it is to ask', /Dana/.test(noaLine), noaLine);
	check('the asker reads "your turn to ask"', /התור שלכם לשאול|your turn to ask/i.test(await textOf(dana.page, '.flow__asker')));
	check('the header says turn 1 of 4', /1.*4/.test(await textOf(dana.page, '.frame__header')), await textOf(dana.page, '.frame__header'));

	// 1b. the strip is a peek --------------------------------------------------------
	const nowPills = await dana.page.locator('[data-testid=pill-now]').evaluateAll((els) => els.map((e) => e.closest('.substeps__pill')?.dataset.step));
	check('only the official pill says "now" (pick)', nowPills.join() === 'pick', nowPills.join());
	await dana.page.locator('.substeps__pill[data-step=talk]').click();
	await dana.page.waitForSelector(tid('peek-body'), { timeout: TIMEOUT });
	const enabled = await dana.page.locator(`${tid('peek-body')} :is(button,input,textarea,select):not(:disabled)`).count();
	const disabled = await dana.page.locator(`${tid('peek-body')} :is(button,input,textarea,select):disabled`).count();
	check('a peeked screen has every control disabled', enabled === 0 && disabled > 0, `${enabled} enabled, ${disabled} disabled`);
	const why = await textOf(dana.page, '.frame__instruction');
	check('one line says what the table is doing now', /עדיין בשלב השאלה|still on the question/i.test(why), why);
	check('the header still names the official step', /בוחרים שאלה|question/i.test(await textOf(dana.page, '.frame__header')));
	await dana.page.locator(tid('peek-back')).click();
	await dana.page.waitForFunction(() => !document.querySelector('[data-testid=peek-body]'));
	check('"back to now" returns to the official screen', !(await has(dana.page, 'peek-body')));

	await noa.page.locator('.substeps__pill[data-step=write]').click();
	await noa.page.waitForSelector(tid('peek-body'), { timeout: TIMEOUT });

	// 2. turn 1 by the asker -----------------------------------------------------------
	await dana.page.locator('[data-testid=table-pick-question]').first().click();
	await until(async () => (await tableDoc()).questionId, 'pickQuestion written at the tap');
	await omri.page.waitForSelector('.pick__item--on', { timeout: TIMEOUT });
	check('a tap on a question shows on a tablemate phone at once', true);
	await dana.page.click(tid('table-start'));
	await until(async () => (await tableDoc()).step === 'talk', 'table at talk');
	await noa.page.waitForFunction(() => !document.querySelector('[data-testid=peek-body]'), null, { timeout: TIMEOUT });
	check('the phone jumps to the official step when it changes', !(await has(noa.page, 'peek-body')));
	await dana.page.waitForSelector(`${tid('table-next-speaker')}:not([disabled])`, { timeout: TIMEOUT });
	const noaChips = await noa.page.locator(`${tid('table-next-speaker')}:not([disabled])`).count();
	check('before the first speaker only the asker has enabled chips', noaChips === 0 && (await dana.page.locator(`${tid('table-next-speaker')}:not([disabled])`).count()) === 4);
	check('a tablemate reads "listening"', /מקשיבים לשאלה|Listen to the question/i.test(await textOf(noa.page, '.frame__instruction')), await textOf(noa.page, '.frame__instruction'));
	await dana.page.locator(tid('table-next-speaker')).nth(1).click();
	await until(async () => (await tableDoc()).speakerUid === noa.uid, 'Noa speaks');
	await noa.page.waitForFunction(() => /התור שלכם לדבר|your turn to speak/i.test(document.querySelector('.talk__speaker')?.textContent ?? ''), null, { timeout: TIMEOUT });
	check('the speaker reads "your turn to speak"', true);
	await dana.page.click(tid('table-to-write'));
	await until(async () => (await tableDoc()).step === 'write', 'table at write');
	for (const s of [dana, noa, omri]) {
		await s.page.fill(tid('answer-box'), `answer by ${s.name}`);
		await s.page.click(tid('answer-send'));
	}
	await until(async () => (await db.collection('statements').where('topParentId', '==', mainId).where('statementType', '==', 'option').get()).docs.filter((d) => d.data().classTable?.tableId === tableId).length >= 3, 'three answers');
	await dana.page.click(tid('table-to-rate'));
	await until(async () => (await tableDoc()).step === 'rate', 'table at rate');

	// 3. the hand-off at rate -----------------------------------------------------------
	for (const s of [noa, omri, lior]) await s.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	for (const s of [noa, omri, lior]) {
		check(`${s.name}: hand-off card and the claim button`, (await has(s.page, 'handoff-card')) && (await has(s.page, 'table-claim')));
	}
	check('Dana (asked) has neither the card nor the button', !(await has(dana.page, 'handoff-card')) && !(await has(dana.page, 'table-claim')));
	for (const s of students) {
		const danaChip = await s.page.locator(`.askers__chip[data-uid="${dana.uid}"]`).getAttribute('data-state');
		check(`${s.name}: Dana's chip shows asked`, danaChip === 'done', danaChip);
	}
	const sentText = await textOf(lior.page, tid('handoff-card'));
	check('the card shows how many sent (3 of 4)', /3.*4/.test(sentText), sentText);
	check('Dana reads who asks next', /Noa|Omri|Lior/.test(await textOf(dana.page, tid('rate-next'))));
	await lior.page.emulateMedia({ reducedMotion: 'reduce' });
	const anim = await lior.page.locator('.handoff').evaluate((el) => getComputedStyle(el).animationName);
	check('reduced motion: the card runs no animation', anim === 'none', anim);

	// simultaneous claim by Noa and Omri
	await Promise.all([noa.page.click(tid('table-claim')), omri.page.click(tid('table-claim'))]);
	const turn2 = await until(async () => ((await tableDoc()).turn === 2 ? await tableDoc() : null), 'turn 2 started');
	const winner = byUid.get(turn2.askerUid);
	const loser = winner === noa ? omri : noa;
	check('exactly one claim won (turn = 2, asker is Noa or Omri)', [noa.uid, omri.uid].includes(turn2.askerUid) && turn2.step === 'pick', winner.name);
	check('the old asker is marked asked', JSON.stringify(turn2.askedUids) === JSON.stringify([dana.uid]), JSON.stringify(turn2.askedUids));
	await loser.page.waitForFunction((n) => new RegExp(n).test(document.querySelector('.flow__asker')?.textContent ?? ''), winner.name, { timeout: TIMEOUT });
	check('the loser sees whose turn it is, and no error', (await loser.page.locator('.c3-error').count()) === 0);
	check('the winner reads "your turn to ask"', /התור שלכם לשאול|your turn to ask/i.test(await textOf(winner.page, '.flow__asker')));
	const forged = await callStep(dana.uid, { action: 'nextTurn' });
	check('a forged claim by someone who already asked is refused (already-asked)', forged.status === 'PERMISSION_DENIED' && forged.reason === 'already-asked', JSON.stringify(forged));
	const stale = await callStep(loser.uid, { action: 'nextTurn' });
	check('a claim after the step moved is refused (turn-claimed)', stale.status === 'FAILED_PRECONDITION' && stale.reason === 'turn-claimed', JSON.stringify(stale));

	// turn 2 by the winner, then the loser claims turn 3
	async function runToRate(asker) {
		await asker.page.waitForSelector('.pick__list', { timeout: TIMEOUT });
		const pickable = asker.page.locator('[data-testid=table-pick-question]:not([disabled])');
		if ((await pickable.count()) === 0) {
			// four askers, three questions: the last one writes their own (the table's own question)
			await asker.page.click('button.pick__add');
			await asker.page.fill('.pick__input', 'Our own question');
			await asker.page.click('form.pick__add button[type=submit]');
		}
		await pickable.first().click({ timeout: TIMEOUT });
		await until(async () => (await tableDoc()).questionId, 'a question chosen');
		await asker.page.click(`${tid('table-start')}:not([disabled])`);
		await until(async () => (await tableDoc()).step === 'talk', 'talk');
		await asker.page.click(tid('table-to-write'));
		await until(async () => (await tableDoc()).step === 'write', 'write');
		await asker.page.click(tid('table-to-rate'));
		await until(async () => (await tableDoc()).step === 'rate', 'rate').catch(async (e) => {
			const doc = await tableDoc();
			console.info('DEBUG table at timeout', doc.step, doc.turn, JSON.stringify(doc.askedUids));
			console.info('DEBUG', asker.name, (await asker.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
			throw e;
		});
	}
	await runToRate(winner);
	for (const s of [loser, lior]) await s.page.waitForSelector(tid('table-claim'), { timeout: TIMEOUT });
	check('turn 2 rate: the two not-yet students have the card', (await has(loser.page, 'handoff-card')) && (await has(lior.page, 'handoff-card')) && !(await has(dana.page, 'handoff-card')) && !(await has(winner.page, 'handoff-card')));
	await loser.page.click(tid('table-claim'));
	await until(async () => (await tableDoc()).turn === 3, 'turn 3 started');
	await runToRate(loser);

	// 4. the last student, then everyone asked ------------------------------------------
	await lior.page.waitForSelector(tid('handoff-card'), { timeout: TIMEOUT });
	check('turn 3 rate: only Lior has the card', !(await has(dana.page, 'handoff-card')) && !(await has(winner.page, 'handoff-card')) && !(await has(loser.page, 'handoff-card')));
	check('Lior\'s card says "your turn to ask"', /התור שלכם לשאול|your turn to ask/i.test(await textOf(lior.page, tid('handoff-card'))), await textOf(lior.page, tid('handoff-card')));
	check('Lior\'s card is the "one left" form', (await lior.page.locator(tid('handoff-card')).getAttribute('data-mode')) === 'one');
	await lior.page.click(tid('table-claim'));
	await until(async () => (await tableDoc()).turn === 4, 'turn 4 started');
	check('Lior is the asker of turn 4', (await tableDoc()).askerUid === lior.uid);
	await runToRate(lior);
	for (const s of students) await s.page.waitForSelector(tid('rate-next'), { timeout: TIMEOUT });
	for (const s of students) {
		const states = await s.page.locator('.askers__chip').evaluateAll((els) => els.map((e) => e.dataset.state));
		check(`${s.name}: every chip shows asked`, states.every((x) => x === 'done'), states.join());
		check(`${s.name}: no card and no forward control`, !(await has(s.page, 'handoff-card')) && !(await has(s.page, 'table-claim')) && (await s.page.locator('.frame__action button').count()) === 0);
		check(`${s.name}: "wait for the other tables"`, /חכו לשאר השולחנות|wait for the other tables/i.test(await textOf(s.page, '.frame__instruction')), await textOf(s.page, '.frame__instruction'));
	}
	const done = await tableDoc();
	check('the table stored no finished flag (derived from askedUids)', !('finished' in done) && done.askedUids.length === 3, JSON.stringify(done.askedUids));
	const lateTeacher = await (async () => {
		const customToken = seed.teacher.customToken;
		const signIn = await fetch(`http://localhost:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
		const { idToken } = await signIn.json();
		const res = await fetch(`http://localhost:${FUNCTIONS_PORT}/${PROJECT}/me-west1/classTableStep`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { tableId, action: 'nextTurn' } }) });
		const json = await res.json();

		return json.error ? { status: json.error.status, reason: json.error.details?.reason } : { ok: true };
	})();
	check('a teacher\'s next turn is refused when everyone asked (all-asked)', lateTeacher.status === 'FAILED_PRECONDITION' && lateTeacher.reason === 'all-asked', JSON.stringify(lateTeacher));

	// 5. the teacher's card ---------------------------------------------------------------
	await tableRef.set({ ...(await tableDoc()), step: 'rate', askerUid: dana.uid, turn: 1, askedUids: [] , updatedAt: Date.now() });
	const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
	const tpage = await tctx.newPage();
	tpage.on('pageerror', (e) => errors.push(`teacher: ${e.message}`));
	await tpage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await tpage.evaluate(async (token) => {
		const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
		const { auth } = await import('/src/lib/firebase.ts');
		await authMod.signInWithCustomToken(auth, token);
	}, seed.teacher.customToken);
	await tpage.goto(`${BASE}/t/${mainId}`, { waitUntil: 'domcontentloaded' });
	const card = tpage.locator(`.table-card[data-table="1"]`);
	await card.waitFor({ timeout: TIMEOUT });
	check('the card says turn 1 of 4', /1.*4/.test(await textOf(tpage, '.table-card[data-table="1"] .table-card__turn')), await textOf(tpage, '.table-card[data-table="1"] .table-card__turn'));
	check('the card names who has not asked', /Noa|Omri|Lior|[֐-׿]/.test(await textOf(tpage, '.table-card[data-table="1"] .table-card__wait').catch(() => '')));
	const quick = await tpage.locator('.table-card[data-table="1"] [data-quick]').evaluateAll((els) => els.map((e) => e.dataset.quick));
	check('one next-step button: start the next turn', quick.join() === 'turn', quick.join());
	await tpage.locator('.table-card[data-table="1"] [data-quick=turn]').click();
	const next = await until(async () => ((await tableDoc()).turn === 2 ? await tableDoc() : null), 'teacher started turn 2');
	check('the teacher\'s turn goes to the first not-yet student in seating order', next.askerUid === noa.uid && JSON.stringify(next.askedUids) === JSON.stringify([dana.uid]), `${next.askerUid} ${JSON.stringify(next.askedUids)}`);
	await tpage.locator(`.table-card[data-table="1"] .table-card__title`).click();
	await tpage.waitForSelector('.table-sheet', { timeout: TIMEOUT });
	const sheetVerbs = await tpage.locator('.table-sheet__actions [data-quick]').evaluateAll((els) => els.map((e) => e.dataset.quick));
	check('the sheet has every step verb', sheetVerbs.join() === 'talk,write,rate,turn', sheetVerbs.join());
	check('the sheet offers "give the turn to" at pick', (await tpage.locator(tid('sheet-pass-asker')).count()) === 2);
	await tpage.locator(tid('sheet-pass-asker')).first().click();
	await until(async () => (await tableDoc()).askerUid !== noa.uid, 'the teacher passed the turn');
	const passed = await tableDoc();
	check('passing the turn keeps the turn number and who asked', passed.turn === 2 && passed.askerUid !== dana.uid && JSON.stringify(passed.askedUids) === JSON.stringify([dana.uid]));

	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
	console.error('e2e-table-turn aborted', e);
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
