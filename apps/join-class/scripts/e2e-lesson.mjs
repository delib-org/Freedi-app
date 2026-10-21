// Full-lesson e2e for WizCol Class on the emulators.
//
//   npm run e2e:lesson         (from apps/join-class)
//
// Needs, already running:
//   - emulators: auth, firestore, database (+ functions for the engine phases)
//   - the app on JOIN_CLASS_URL, built/served with the same emulator ports and
//     VITE_CLASS_CLOCK_SPEED=20 (so a speaker's minute is 3 s on screen)
// E2E_SHOTS=<dir> also saves a screenshot of every projector step.
// Ports and URL come from e2e-env.mjs (E2E_AUTH_PORT / E2E_FIRESTORE_PORT /
// JOIN_CLASS_URL / E2E_PROJECT_ID; defaults are CI's: 9099, 8081, 3035).
//
// Phases (each prints PASS / FAIL, or PENDING_ENGINE when it needs code from
// the other classroom lanes):
//   1. plan      teacher creates a lesson, writes the challenge + 3 table questions
//   2. waiting   projector at /t/:mid/screen shows the code; 6 students join by /c/:code
//   3. projector every step of the lesson on the projector, driven by admin-SDK writes
//   4. engine    sides on the slider, seating, two table turns, proposals, plenum,
//                ballot, summary with support by side  -> PENDING_ENGINE unless
//                E2E_LESSON_ENGINE=1 (see e2e-lesson-engine.mjs for the testids)
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ENGINE_PHASES } from './e2e-lesson-engine.mjs';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';

const ENGINE_ON = process.env.E2E_LESSON_ENGINE === '1';
const TIMEOUT = 20000;
const STUDENTS = 6;
const PROJECTOR_VIEWPORT = { width: 1920, height: 1080 };
const MIN_TEXT_PX = 32;
const WAITING_CODE_PX = 160;
const OPENING_QUESTION_PX = 72;
const CHALLENGE_TEXT = 'Should the school ban phones during lessons?';
const TABLE_QUESTIONS = ['What do you gain?', 'What does it cost someone?', 'Who is not heard?'];
const STEP_KEYS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
const PROPOSALS = [
	{ text: 'Phones stay in a box during lessons', consensus: 0.72 },
	{ text: 'Phones only when the teacher asks', consensus: 0.64 },
	{ text: 'Each class sets its own rule', consensus: 0.48 },
	{ text: 'No ban, a visible screen timer', consensus: 0.31 },
];

const admin = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
admin.settings({ ignoreUndefinedProperties: true });

let failures = 0;
let pending = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `read` until `ok(value)`; returns the last value (the check then reports it). */
async function eventually(read, ok, timeout = TIMEOUT) {
	const end = Date.now() + timeout;
	let value = await read();
	while (!ok(value) && Date.now() < end) {
		await sleep(250);
		value = await read();
	}

	return value;
}

const browser = await chromium.launch();
const teacherContext = await browser.newContext({ viewport: PROJECTOR_VIEWPORT });
const teacher = await teacherContext.newPage();
const pageErrors = [];
teacher.on('pageerror', (e) => pageErrors.push(`teacher: ${e.message}`));
const students = [];
let mid = '';
let code = '';
let challengeId = '';

// ---- 1. plan ------------------------------------------------------------------
async function phasePlan() {
	await teacher.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await teacher.click('button.login__btn--guest', { timeout: TIMEOUT });
	await teacher.waitForURL((u) => u.pathname === '/', { timeout: TIMEOUT });
	await teacher.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await teacher.click('.teacher-home__new', { timeout: TIMEOUT });
	await teacher.fill('#teacher-new-title', `Full lesson ${Date.now()}`);
	await teacher.click('.teacher-home__form button[type=submit]');
	await teacher.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });
	mid = new URL(teacher.url()).pathname.split('/')[2];

	const challenge = teacher.locator('.plan-card__text--challenge');
	await teacher.waitForSelector('.plan__challenge', { timeout: TIMEOUT });
	await challenge.fill(CHALLENGE_TEXT);
	await challenge.blur();
	await teacher.waitForFunction(
		() => document.querySelector('.plan-card__text--challenge')?.disabled === false,
		null,
		{ timeout: TIMEOUT },
	);

	const focusedNew = 'li.plan-card--new .plan-card__text:focus';
	await teacher.click('.plan__add');
	for (const [index, text] of TABLE_QUESTIONS.entries()) {
		await teacher.waitForSelector(focusedNew, { timeout: TIMEOUT });
		await teacher.keyboard.type(text);
		await teacher.keyboard.press('Enter');
		if (index < TABLE_QUESTIONS.length - 1) {
			await teacher.waitForFunction(
				() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '',
				null,
				{ timeout: TIMEOUT },
			);
		}
	}
	await teacher.locator('.plan__title').click();
	await teacher.click('.plan__save');
	await teacher.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });

	const questions = await eventually(
		async () => (await admin.collection('statements').where('parentId', '==', mid).get()).docs,
		(docs) => docs.length === TABLE_QUESTIONS.length + 1,
	);
	check('plan: challenge + 3 table questions are saved', questions.length === 4, `${questions.length} questions`);
	const roles = questions.map((d) => d.data().statementSettings?.classRole ?? 'guiding');
	check('plan: exactly one challenge question', roles.filter((r) => r === 'challenge').length === 1);
	challengeId = questions.find((d) => d.data().statementSettings?.classRole === 'challenge')?.id ?? '';
	check('plan: challenge id found', challengeId !== '');
}

// ---- 2. waiting room ------------------------------------------------------------
async function projectorStage() {
	return (await teacher.locator('.projector__stage').count()) > 0
		? (await teacher.locator('.projector__stage').getAttribute('data-step')) ?? ''
		: '';
}

async function phaseWaiting() {
	await teacher.goto(`${BASE}/t/${mid}/screen`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.projector-code', { timeout: TIMEOUT });
	code = ((await teacher.locator('.projector-code').textContent()) ?? '').trim();
	check('waiting: the projector shows a 6-digit code', /^\d{6}$/.test(code), code);
	const codeSize = await teacher.locator('.projector-code').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	check(`waiting: code is ${WAITING_CODE_PX} px`, codeSize >= WAITING_CODE_PX, `${codeSize}px`);
	await teacher.waitForSelector('.projector-qr--waiting svg', { timeout: TIMEOUT });
	check('waiting: QR at 320 px', true);

	// the lesson workspace only shows the student stage once it has a lesson plan
	// (the console writes it when the teacher opens the lesson); do the same here
	await setPlan(0);
	for (let i = 0; i < STUDENTS; i += 1) {
		const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
		const page = await context.newPage();
		page.on('pageerror', (e) => pageErrors.push(`student ${i + 1}: ${e.message}`));
		await page.goto(`${BASE}/c/${code}`, { waitUntil: 'domcontentloaded' });
		students.push({ index: i, context, page });
	}
	for (const student of students) {
		await student.page.waitForURL((u) => u.pathname === `/m/${mid}`, { timeout: TIMEOUT });
	}
	check('waiting: six students joined by code and landed on the lesson', true);

	const count = await eventually(
		async () => (await teacher.locator('.projector-count').textContent()) ?? '',
		(text) => text.includes(String(STUDENTS)),
	);
	check('waiting: projector counts six in class', count.includes(String(STUDENTS)), count);
}

// ---- 3. the projector, step by step -----------------------------------------------
async function setPlan(index) {
	await admin
		.collection('statements')
		.doc(mid)
		.update({
			'statementSettings.lessonPlan': { steps: STEP_KEYS, stepIndex: index },
			lastUpdate: Date.now(),
		});
}

async function setStep(index) {
	await setPlan(index);
	await teacher.waitForFunction(
		(key) => document.querySelector('.projector__stage')?.getAttribute('data-step') === key,
		STEP_KEYS[index],
		{ timeout: TIMEOUT },
	);
}

/** Smallest computed font size among elements that carry their own text. */
async function smallestText() {
	return teacher.evaluate(() => {
		let smallest = Infinity;
		for (const el of document.querySelectorAll('.projector *')) {
			const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
			if (!own || el.closest('svg')) continue;
			smallest = Math.min(smallest, parseFloat(getComputedStyle(el).fontSize));
		}

		return smallest;
	});
}

async function checkBand(stepKey) {
	if (process.env.E2E_SHOTS) {
		await teacher.screenshot({ path: `${process.env.E2E_SHOTS}/projector-${stepKey}.png` });
	}
	const bandCode = ((await teacher.locator('.projector-band__code').textContent()) ?? '').trim();
	check(`${stepKey}: bottom band shows the code`, bandCode === code, bandCode);
	check(`${stepKey}: bottom band shows a QR`, (await teacher.locator('.projector-band .projector-qr svg').count()) === 1);
	const smallest = await smallestText();
	check(`${stepKey}: smallest text >= ${MIN_TEXT_PX} px`, smallest >= MIN_TEXT_PX, `${smallest}px`);
}

async function studentSubs() {
	const snap = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();

	return snap.docs.filter((d) => d.data().role !== 'admin');
}

async function phaseProjector() {
	const subs = await studentSubs();
	check('projector: six student subscriptions exist', subs.length === STUDENTS, `${subs.length}`);
	const mainSnap = await admin.collection('statements').doc(mid).get();
	const creatorId = mainSnap.data()?.creatorId;
	const pupils = subs.filter((d) => d.data().userId !== creatorId);

	// Students arrive anonymous with no display name; the name step is C2's join
	// screen. Until it is merged, give them names the way that step will.
	for (const [i, d] of pupils.entries()) await d.ref.update({ 'user.displayName': `Student ${i + 1}` });

	// waiting
	await setStep(0);
	await checkBand('waiting');

	// opening: the question at 72 px (no video in this lesson: question card alone)
	await setStep(1);
	const question = teacher.locator('.projector-question');
	check('opening: question text', ((await question.textContent()) ?? '') === CHALLENGE_TEXT);
	const questionSize = await question.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	check(`opening: question is ${OPENING_QUESTION_PX} px`, questionSize >= OPENING_QUESTION_PX, `${questionSize}px`);
	check('opening: no video element before the teacher presses play', (await teacher.locator('.projector iframe, .projector video').count()) === 0);
	await checkBand('opening');

	// side: the two characters, no counts
	await setStep(2);
	check('side: two characters', (await teacher.locator('.projector-character').count()) === 2);
	const sideText = (await teacher.locator('.projector__stage').textContent()) ?? '';
	check('side: no counts on the screen', !/\d/.test(sideText), sideText);
	await checkBand('side');

	// tables: 2 tables with names
	for (const [i, pair] of [pupils.slice(0, 3), pupils.slice(3)].entries()) {
		const n = i + 1;
		await admin
			.collection('classTables')
			.doc(`${mid}--${n}`)
			.set({
				tableId: `${mid}--${n}`,
				mainId: mid,
				n,
				memberUids: pair.map((d) => d.data().userId),
				noDeviceMembers: [],
				step: n === 1 ? 'talk' : 'write',
				askerUid: pair[0].data().userId,
				turn: 1,
				writingMode: 'each',
				writingLocked: false,
				spokenUids: [],
				usedQuestionIds: [],
				updatedAt: Date.now(),
			});
		for (const d of pair) await d.ref.update({ tableId: `${mid}--${n}` });
	}
	await setStep(3);
	await teacher.waitForFunction(() => document.querySelectorAll('.projector-tile').length === 2, null, { timeout: TIMEOUT });
	const tileTitles = await teacher.locator('.projector-tile__title').allTextContents();
	check('tables: one tile per table, in table order', tileTitles.length === 2 && /1/.test(tileTitles[0]) && /2/.test(tileTitles[1]), tileTitles.join(' | '));
	const names = (await teacher.locator('.projector-tile__names').allTextContents()).join('');
	check('tables: member names shown', names.trim().length > 0, names);
	await checkBand('tables');

	// table talk: counts only
	await setStep(4);
	const tiles = await teacher.locator('.projector-count-tile__value').allTextContents();
	check('tableTalk: four count tiles (picking, talking, writing, rating)', tiles.join(',') === '0,1,1,0', tiles.join(','));
	await admin.collection('classTables').doc(`${mid}--1`).update({ step: 'rate' });
	await admin.collection('classTables').doc(`${mid}--2`).update({ step: 'rate' });
	await teacher.waitForFunction(() => document.querySelectorAll('.projector-count-tile').length === 1, null, { timeout: TIMEOUT });
	check('tableTalk: all tables rating collapses to one tile', true);
	await checkBand('tableTalk');

	// proposals: gate bars, then the plenum
	const optionIds = [];
	for (const [i, proposal] of PROPOSALS.entries()) {
		const id = `${mid}-proposal-${i + 1}`;
		optionIds.push(id);
		await admin.collection('statements').doc(id).set({
			statementId: id,
			statement: proposal.text,
			statementType: 'option',
			parentId: challengeId,
			topParentId: mid,
			creatorId: creatorId ?? 'teacher',
			consensus: proposal.consensus,
			hide: false,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
	}
	await setStep(5);
	await teacher.waitForFunction((n) => document.querySelectorAll('.projector-gate-bar').length === n, PROPOSALS.length, { timeout: TIMEOUT });
	const passed = await teacher.locator('.projector-gate-bar--passed').count();
	check('proposals: gate bars, the two above 0.6 passed', passed === 2, `${passed} passed`);
	const trackHeight = await teacher.locator('.projector-gate-bar__track').first().evaluate((el) => parseFloat(getComputedStyle(el).height));
	check('proposals: gate bars are 28 px', trackHeight === 28, `${trackHeight}px`);
	await checkBand('proposals');
	await admin.collection('statements').doc(challengeId).update({ 'statementSettings.roundPhase': 'improve' });
	await teacher.waitForFunction(() => document.querySelectorAll('.projector-top__card').length > 0, null, { timeout: TIMEOUT });
	const cards = await teacher.locator('.projector-top__text').allTextContents();
	check('plenum: top proposals by consensus, best first', cards[0] === PROPOSALS[0].text && cards.length === PROPOSALS.length, cards.join(' | '));

	// vote: live tally over the frozen ballot
	await admin.collection('statements').doc(challengeId).update({
		'statementSettings.ballot': { candidateIds: optionIds.slice(0, 3), frozenAt: Date.now() },
		selections: { [optionIds[0]]: 1, [optionIds[1]]: 3 },
	});
	await setStep(6);
	await teacher.waitForFunction(() => document.querySelectorAll('.projector-tally__row').length === 3, null, { timeout: TIMEOUT });
	const counts = () => teacher.locator('.projector-tally__count').allTextContents();
	check('vote: tally counts from selections', (await counts()).join(',') === '1,3,0', (await counts()).join(','));
	await admin.collection('statements').doc(challengeId).update({ [`selections.${optionIds[2]}`]: FieldValue.increment(5) });
	const live = await eventually(counts, (c) => c.join(',') === '1,3,5');
	check('vote: tally is live', live.join(',') === '1,3,5', live.join(','));
	await checkBand('vote');

	// summary: decision card + support by side + verdict
	await admin.collection('statements').doc(challengeId).update({ 'statementSettings.ballot.decisionId': optionIds[2] });
	for (const [i, d] of pupils.entries()) {
		const camp = i < 2 ? 'a' : i >= STUDENTS - 2 ? 'b' : 'center';
		await d.ref.update({ camp, side: camp === 'a' ? 10 : camp === 'b' ? 90 : 50, decisionSupport: 0.9 });
	}
	await setStep(7);
	const decision = await eventually(
		async () => (await teacher.locator('.projector-decision__text').textContent()) ?? '',
		(text) => text === PROPOSALS[2].text,
	);
	check('summary: decision card shows the decided proposal', decision === PROPOSALS[2].text, decision);
	check('summary: three support bars', (await teacher.locator('.projector-support__row').count()) === 3);
	const verdict = await eventually(
		async () => (await teacher.locator('.projector-verdict').getAttribute('class')) ?? '',
		(c) => c.includes('--closer'),
	);
	check('summary: verdict "the sides came closer" (both sides >= gate)', verdict.includes('--closer'), verdict);
	await checkBand('summary');
}

// ---- 4. engine phases ---------------------------------------------------------------
async function phaseEngine() {
	if (!ENGINE_ON) {
		for (const phase of ENGINE_PHASES) {
			pending += 1;
			console.info(`PENDING_ENGINE  ${phase.name}`);
		}

		return;
	}
	// back to the start of the lesson, with no tables / proposals left over from phase 3
	for (const collection of ['classTables']) {
		const snap = await admin.collection(collection).where('mainId', '==', mid).get();
		await Promise.all(snap.docs.map((d) => d.ref.delete()));
	}
	await setStep(0).catch(() => undefined);
	for (const phase of ENGINE_PHASES) {
		try {
			await phase.run({ teacher, students, check, admin, mid, code });
			check(`engine: ${phase.name}`, true);
		} catch (err) {
			check(`engine: ${phase.name}`, false, String(err).split('\n')[0]);
		}
	}
}

const PHASES = [
	['plan', phasePlan],
	['waiting', phaseWaiting],
	['projector', phaseProjector],
	['engine', phaseEngine],
];

for (const [name, run] of PHASES) {
	console.info(`--- phase: ${name}`);
	try {
		await run();
	} catch (err) {
		failures += 1;
		console.error(`FAIL  phase ${name} aborted:`, err);
		await teacher.screenshot({ path: `e2e-lesson-${name}-failure.png`, fullPage: true }).catch(() => undefined);
		if (name === 'plan' || name === 'waiting') break;
	}
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();
console.info(
	failures === 0
		? `E2E LESSON: all runnable phases green${pending ? ` (${pending} PENDING_ENGINE)` : ''}`
		: `E2E LESSON: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
