// E2E of the student table screens part 2 (lane C3): screens-down talk, write +
// send, rate, vote, summary. Two phones (asker + non-asker) at the same table.
// The engine (lane C1 callables) is not on this branch, so the script writes the
// table state with the admin SDK exactly as the engine would, and asserts that a
// failing callable shows an inline error instead of crashing.
//
// Setup (C3 ports; repo root):
//   npx firebase emulators:start -c firebase.c3.local.json --project freedi-test --only firestore,auth,database
//   (rules: firestore.rules + a read rule for classTables, until C1 adds it)
//   FIRESTORE_EMULATOR_HOST=localhost:8133 FIREBASE_AUTH_EMULATOR_HOST=localhost:9133 GCLOUD_PROJECT=freedi-test \
//     npx tsx apps/join-class/scripts/seed-classroom.ts --step=4 --seated --proposals --support --id=c3main
//   (apps/join-class) VITE_EMULATOR_AUTH_PORT=9133 VITE_EMULATOR_FIRESTORE_PORT=8133 \
//     VITE_EMULATOR_DATABASE_PORT=9033 VITE_EMULATOR_FUNCTIONS_PORT=5033 npx vite --port 3033 --strictPort
//   node scripts/e2e-student-2.mjs
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
const ENGINE = process.env.E2E_ENGINE === '1';
// seed a class at step 4 (tables talking) with proposals and support, like the engine would leave it
execFileSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=4', '--seated', '--proposals', '--support', `--id=c3-${Date.now()}`],
	{ cwd: join(here, '..', '..', '..'), env: process.env, stdio: 'ignore' },
);
const seed = JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
const { mainId, challengeId, guidingIds, proposalIds } = seed;
const tableId = `${mainId}--1`;

if (getApps().length === 0) initializeApp({ projectId: PROJECT });
const db = getFirestore();

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

async function authUids() {
	const listed = await getAuth().listUsers(1000);

	return new Set(listed.users.map((u) => u.uid));
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

const browser = await chromium.launch();
const errors = [];

async function newStudent(name) {
	const before = await authUids();
	const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await page.click('button.login__btn--guest', { timeout: TIMEOUT });
	await page.waitForURL((u) => u.pathname === '/', { timeout: TIMEOUT });
	const uid = await until(async () => {
		const now = await authUids();

		return [...now].find((id) => !before.has(id));
	}, `${name} auth uid`);
	await page.goto(`${BASE}/m/${mainId}`, { waitUntil: 'domcontentloaded' });
	const subRef = db.doc(`statementsSubscribe/${uid}--${mainId}`);
	await until(async () => (await subRef.get()).exists, `${name} subscription`);
	await subRef.update({ tableId, side: 20, camp: 'a', lastUpdate: Date.now() });

	return { page, uid, name };
}

try {
	const a = await newStudent('asker');
	const b = await newStudent('mate');
	await db.doc(`statementsSubscribe/${a.uid}--${mainId}`).update({ 'user.displayName': 'Dana' });
	await db.doc(`statementsSubscribe/${b.uid}--${mainId}`).update({ 'user.displayName': 'Omer' });
	const tableRef = db.doc(`classTables/${tableId}`);
	const setTable = (patch) => tableRef.set({ ...patch, updatedAt: Date.now() }, { merge: true });
	await tableRef.set(
		{
			tableId,
			mainId,
			n: 1,
			memberUids: [a.uid, b.uid],
			noDeviceMembers: [],
			step: 'pick',
			askerUid: a.uid,
			turn: 1,
			writingMode: 'each',
			writingLocked: false,
			spokenUids: [],
			usedQuestionIds: [],
			updatedAt: Date.now(),
		},
	);

	// 1. pick (asker) --------------------------------------------------------
	await a.page.waitForSelector('[data-testid=asker-mark]', { timeout: TIMEOUT });
	check('asker line shown on the asker device only', (await b.page.locator('[data-testid=asker-mark]').count()) === 0);
	const picks = a.page.locator('[data-testid=table-pick-question]');
	await picks.first().waitFor({ timeout: TIMEOUT });
	check('pick list shows the teacher\'s questions', (await picks.count()) >= 2, `${await picks.count()}`);
	check('non-asker cannot choose', await b.page.locator('[data-testid=table-pick-question]').first().isDisabled());
	await picks.first().click();
	await a.page.click('[data-testid=table-start]');
	if (ENGINE) {
		// the real callable answers: the table leaves "pick" (or, if it refuses, the inline error shows)
		await until(async () => {
			const step = (await tableRef.get()).data()?.step;

			return step !== 'pick' || (await a.page.locator('.c3-error').count()) > 0;
		}, 'classTableStep answered');
		check('the real classTableStep callable answered (engine on)', true);
	} else {
		await a.page.waitForSelector('.c3-error', { timeout: TIMEOUT });
		check('failed callable shows an inline error with retry, no crash', (await a.page.locator('.c3-error__retry').count()) === 1);
	}

	// 2. talk (screens down) ---------------------------------------------------
	await setTable({
		step: 'talk',
		questionId: guidingIds[0],
		speakerUid: b.uid,
		speakerEndsAt: Date.now() + 34_000,
		spokenUids: [],
	});
	await a.page.waitForSelector('.frame--down [role=timer]', { timeout: TIMEOUT });
	// the minute may render idle ("1:00") for a moment before the table doc with speakerEndsAt arrives
	await a.page
		.waitForFunction(() => /^0:3\d$/.test((document.querySelector('[role=timer]')?.textContent ?? '').trim()), null, { timeout: TIMEOUT })
		.catch(() => undefined);
	const digits = (await a.page.locator('[role=timer]').innerText()).trim();
	check('screens-down countdown reads about 0:3x', /^0:3\d$/.test(digits), digits);
	const size = await a.page.locator('.count__num').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	check('digits are 96px or larger', size >= 96, `${size}px`);
	check('asker has "we are done, write"; the mate does not', (await a.page.locator('[data-testid=table-to-write]').count()) === 1 && (await b.page.locator('[data-testid=table-to-write]').count()) === 0);
	check('speaker chips for both tablemates', (await a.page.locator('[data-testid=table-next-speaker]').count()) === 2);
	check('mate chips disabled during the minute', await b.page.locator('[data-testid=table-next-speaker]').first().isDisabled());
	await setTable({ speakerEndsAt: Date.now() - 1000 });
	await a.page.waitForSelector('[data-testid=time-over]', { timeout: TIMEOUT });
	check('"time is up" replaces the digits', (await a.page.locator('[role=timer]').count()) === 0);
	await b.page.waitForFunction(
		() => !document.querySelector('[data-testid=table-next-speaker]')?.disabled,
		null,
		{ timeout: TIMEOUT },
	);
	check('mate may pick the next speaker once the minute is over', true);

	// 3. write -----------------------------------------------------------------
	await setTable({ step: 'write' });
	const answerText = `Answer from Dana ${Date.now()}`;
	const proposalText = `Proposal from Dana ${Date.now()}`;
	await a.page.waitForSelector('[data-testid=answer-box]', { timeout: TIMEOUT });
	await a.page.fill('[data-testid=answer-box]', answerText);
	await a.page.fill('[data-testid=proposal-box]', proposalText);
	await a.page.click('[data-testid=answer-send]');
	const sent = await until(async () => {
		const answers = await db.collection('statements').where('parentId', '==', guidingIds[0]).where('creatorId', '==', a.uid).get();
		const proposals = await db.collection('statements').where('parentId', '==', challengeId).where('creatorId', '==', a.uid).get();

		return answers.size === 1 && proposals.size === 1 ? { answer: answers.docs[0].data(), proposal: proposals.docs[0].data() } : null;
	}, 'answer + proposal written');
	check('send creates an option with the classTable marker', sent.answer.classTable?.tableId === tableId && sent.answer.statement === answerText);
	check('the proposal goes under the challenge question', sent.proposal.statement === proposalText);
	await a.page.waitForSelector('.write__sent', { timeout: TIMEOUT });
	check('"Sent" shown after sending', true);

	// 4. rate ------------------------------------------------------------------
	await setTable({ step: 'rate' });
	await a.page.waitForSelector('.text-card', { timeout: TIMEOUT });
	const cards = await a.page.locator('.text-card__body').allInnerTexts();
	check('rate list is not empty', cards.length > 0, `${cards.length} cards`);
	check('own items are never listed', !cards.includes(answerText) && !cards.includes(proposalText));
	await a.page.locator('[data-testid=rate-face-5]').first().click();
	const rated = await until(async () => {
		const snap = await db.collection('evaluations').where('evaluatorId', '==', a.uid).get();

		return snap.size > 0 ? snap.docs[0].data() : null;
	}, 'evaluation written');
	check('a face tap writes an evaluation of +1', rated.evaluation === 1, `${rated.evaluation}`);
	await a.page.click('.flow__class');
	await a.page.waitForSelector('.sheet__panel[role=dialog]', { timeout: TIMEOUT });
	await a.page.keyboard.press('Escape');
	await a.page.waitForSelector('.sheet__panel', { state: 'detached', timeout: TIMEOUT });
	check('class sheet opens and Escape closes it', true);

	// 5. vote ------------------------------------------------------------------
	const candidates = proposalIds.slice(0, 3);
	await db.doc(`statements/${challengeId}`).update({
		'statementSettings.ballot': { candidateIds: candidates, frozenAt: Date.now() },
	});
	await db.doc(`statements/${mainId}`).update({ 'statementSettings.lessonPlan.stepIndex': 6 });
	await a.page.waitForSelector('[data-testid=vote-option]', { timeout: TIMEOUT });
	check('ballot shows the candidates as radio cards', (await a.page.locator('[data-testid=vote-option]').count()) === candidates.length);
	await a.page.locator('[data-testid=vote-option]').nth(1).click();
	await a.page.click('[data-testid=vote-send]');
	const vote = await until(async () => {
		const snap = await db.doc(`votes/${a.uid}--${challengeId}`).get();

		return snap.exists ? snap.data() : null;
	}, 'vote doc');
	check('the vote doc is written at step 6', vote.statementId === candidates[1]);

	// 6. summary ---------------------------------------------------------------
	await db.doc(`statements/${challengeId}`).update({
		'statementSettings.ballot': { candidateIds: candidates, frozenAt: Date.now(), closedAt: Date.now(), decisionId: candidates[1] },
	});
	await db.doc(`statements/${mainId}`).update({ 'statementSettings.lessonPlan.stepIndex': 7 });
	await a.page.waitForSelector('.decision__text', { timeout: TIMEOUT });
	check('decision card first', true);
	await a.page.waitForSelector('.support__row', { timeout: TIMEOUT });
	check('three support bars', (await a.page.locator('.support__row').count()) === 3);
	check('a verdict line is shown', (await a.page.locator('.support__verdict').count()) === 1);
	await a.page.locator('[data-testid=support-face-5]').click();
	const mine = await until(async () => {
		const snap = await db.doc(`statementsSubscribe/${a.uid}--${mainId}`).get();

		return snap.data()?.decisionSupport === 1 ? 1 : null;
	}, 'decisionSupport');
	check('a support face writes decisionSupport +1', mine === 1);
	check('no page errors', errors.length === 0, errors.join(' | '));
} catch (error) {
	console.error('[e2e-student-2] failed:', error);
	failures += 1;
} finally {
	await browser.close();
}
console.info(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
