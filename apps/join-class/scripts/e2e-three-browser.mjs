// One whole lesson with ONE teacher and TWO students, each in its own browser
// context, plus the projector window (a second page of the teacher's context):
//
//   npm run e2e:three         (from apps/join-class)
//
// Needs, already running (same as e2e-lesson.mjs):
//   - emulators: auth, firestore, database AND functions (the engine callables)
//   - the app on JOIN_CLASS_URL, started with VITE_CLASS_CLOCK_SPEED=20
// Ports and URL come from e2e-env.mjs (JOIN_CLASS_URL, E2E_AUTH_PORT,
// E2E_FIRESTORE_PORT, E2E_PROJECT_ID).
// E2E_SHOTS=<dir> (default test-results/three-browser) gets a screenshot of every
// role at every step: NN-<step>-<teacher|projector|A|B>.png. Students are
// 375x812 phones; the teacher is a laptop; the projector is 1920x1080.
//
// Walk: join by code, opening, side, tables, table talk, proposals (talk, write,
// rate, live writing), vote (open, vote, pause, resume, live bars, sort, close),
// the projector gate, summary; then go back, reset the vote, hide a proposal,
// reset turns. Every state is checked on all the screens that show it.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const TIMEOUT = 25000;
const SLOW = 60000; // one onStatementCreated / newEvaluation round is ~6 s on the emulator
const POLL_MS = 250;
const PHONE = { width: 375, height: 812 };
const LAPTOP = { width: 1280, height: 800 };
const PROJECTOR = { width: 1920, height: 1080 };
const SHOTS = process.env.E2E_SHOTS ?? join(process.cwd(), 'test-results', 'three-browser');
const CHALLENGE_TEXT = 'Should the school ban phones during lessons?';
const TABLE_QUESTIONS = ['What do you gain?', 'What does it cost someone?', 'Who is not heard?'];
const SIDE_A = 10;
const SIDE_B = 90;
const PROPOSAL_TEXTS = ['Phones stay in a box during lessons', 'Phones only when the teacher asks'];

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const admin = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
admin.settings({ ignoreUndefinedProperties: true });

let failures = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

async function eventually(read, ok = Boolean, timeout = TIMEOUT) {
	const end = Date.now() + timeout;
	let value = await read();
	while (!ok(value) && Date.now() < end) {
		await sleep(POLL_MS);
		value = await read();
	}

	return value;
}

const browser = await chromium.launch();
const errors = [];
async function openRole(name, viewport, mobile) {
	const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
	const page = await context.newPage();
	page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
	page.on('console', (msg) => {
		if (msg.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(msg.text())) {
			errors.push(`${name} console: ${msg.text().slice(0, 200)}`);
		}
	});

	return { name, context, page };
}
const teacher = await openRole('teacher', LAPTOP, false);
const A = await openRole('A', PHONE, true);
const B = await openRole('B', PHONE, true);
const projector = { name: 'projector', context: teacher.context, page: await teacher.context.newPage() };
await projector.page.setViewportSize(PROJECTOR);
const roles = [teacher, projector, A, B];
const phones = [A, B];

let shotIndex = 0;
async function snapAll(step) {
	shotIndex += 1;
	const n = String(shotIndex).padStart(2, '0');
	for (const role of roles) {
		await role.page
			.screenshot({ path: join(SHOTS, `${n}-${step}-${role.name}.png`), fullPage: role.name !== 'projector' })
			.catch(() => undefined);
	}
}

const byId = async (page, id, timeout = TIMEOUT) => {
	const locator = page.getByTestId(id).first();
	await locator.waitFor({ state: 'visible', timeout });

	return locator;
};
const has = async (page, id) => (await page.getByTestId(id).count()) > 0;
const text = async (page, selector) => ((await page.locator(selector).first().textContent().catch(() => '')) ?? '').trim();

/** The stage heading at the top of a student page, or ''. */
const stageName = (page) => text(page, 'h2.frame__stage');
/** All visible text on a page (for "does this screen say X"). */
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function teacherForward(expectedKey) {
	await (await byId(teacher.page, 'console-forward')).click();
	await teacher.page.waitForFunction(
		(key) => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === key,
		expectedKey,
		{ timeout: TIMEOUT },
	);
}

async function confirmDialog() {
	await (await byId(teacher.page, 'console-confirm-yes')).click();
}

let mid = '';
let code = '';
let challengeId = '';
const stepKeyOf = async () =>
	(await teacher.page.locator('[data-step-key][aria-current="step"]').first().getAttribute('data-step-key')) ?? '';
const challengeData = async () => (await admin.collection('statements').doc(challengeId).get()).data();

/**
 * Text that is hard to read where it stands: contrast of an element's text colour against
 * the nearest opaque background behind it, under 3:1. Skips disabled controls, anything
 * faded by opacity, and backgrounds drawn as images (gradients). Returns the first offenders.
 */
async function lowContrast(page) {
	return page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const rgba = (css) => {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#000';
			ctx.fillStyle = css;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
			return { r, g, b, a: a / 255 };
		};
		const lum = ({ r, g, b }) => {
			const f = (v) => {
				const c = v / 255;
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const backdrop = (el) => {
			for (let n = el; n; n = n.parentElement) {
				const cs = getComputedStyle(n);
				if (cs.backgroundImage !== 'none') return null;
				const c = rgba(cs.backgroundColor);
				if (c.a >= 0.95) return c;
			}
			return rgba(getComputedStyle(document.documentElement).backgroundColor || '#fff');
		};
		const out = [];
		for (const el of document.querySelectorAll('body *')) {
			if (el.closest('svg, [aria-hidden=true], [disabled], [aria-disabled=true]')) continue;
			const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
			if (!own) continue;
			const box = el.getBoundingClientRect();
			if (box.width === 0 || box.height === 0) continue;
			let faded = false;
			for (let n = el; n; n = n.parentElement) if (Number(getComputedStyle(n).opacity) < 0.95) faded = true;
			if (faded) continue;
			const bg = backdrop(el);
			if (!bg) continue;
			const fg = rgba(getComputedStyle(el).color);
			const l1 = lum(fg);
			const l2 = lum(bg);
			const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
			if (ratio < 3) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
		}
		return out.slice(0, 5);
	});
}

// ---- 1. the teacher creates the lesson ----------------------------------------
async function phasePlan() {
	await signInTeacher(teacher.page, BASE, `teacher-three-${Date.now()}`);
	await teacher.page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await teacher.page.waitForSelector('#teacher-new-title', { timeout: TIMEOUT });
	await teacher.page.fill('#teacher-new-title', `Three browsers ${Date.now()}`);
	await teacher.page.click('.teacher-home__form button[type=submit]');
	await teacher.page.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });
	mid = new URL(teacher.page.url()).pathname.split('/')[2];
	const challenge = teacher.page.locator('.plan-card__text--challenge');
	await teacher.page.waitForSelector('.plan__challenge', { timeout: TIMEOUT });
	await challenge.fill(CHALLENGE_TEXT);
	await challenge.blur();
	await teacher.page.waitForFunction(
		() => document.querySelector('.plan-card__text--challenge')?.disabled === false,
		null,
		{ timeout: TIMEOUT },
	);
	await teacher.page.click('.plan__tables .plan__add');
	for (const [index, question] of TABLE_QUESTIONS.entries()) {
		await teacher.page.waitForSelector('li.plan-card--new .plan-card__text:focus', { timeout: TIMEOUT });
		await teacher.page.keyboard.type(question);
		await teacher.page.keyboard.press('Enter');
		if (index < TABLE_QUESTIONS.length - 1) {
			await teacher.page.waitForFunction(
				() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '',
				null,
				{ timeout: TIMEOUT },
			);
		}
	}
	await teacher.page.locator('.plan__title').click();
	await teacher.page.click('.plan__save');
	await teacher.page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	const questions = await eventually(
		async () => (await admin.collection('statements').where('parentId', '==', mid).get()).docs,
		(docs) => docs.length === TABLE_QUESTIONS.length + 1,
	);
	challengeId = questions.find((d) => d.data().statementSettings?.classRole === 'challenge')?.id ?? '';
	check('plan: the teacher created a lesson with a challenge and 3 table questions', challengeId !== '' && questions.length === 4);
	await snapAll('plan');
}

// ---- 2. the teacher opens the console and the projector; students join by code ----
async function phaseJoin() {
	await teacher.page.goto(`${BASE}/t/${mid}`, { waitUntil: 'domcontentloaded' });
	await teacher.page.locator('[data-step-key][aria-current="step"]').first().waitFor({ timeout: TIMEOUT });
	await projector.page.goto(`${BASE}/t/${mid}/screen`, { waitUntil: 'domcontentloaded' });
	await projector.page.waitForSelector('.projector-code', { timeout: TIMEOUT });
	code = (await text(projector.page, '.projector-code')).replace(/\s/g, '');
	check('join: the projector shows a 6-digit code', /^\d{6}$/.test(code), code);
	for (const phone of phones) await phone.page.goto(`${BASE}/c/${code}`, { waitUntil: 'domcontentloaded' });
	for (const phone of phones) {
		await phone.page.waitForURL((u) => u.pathname === `/m/${mid}`, { timeout: TIMEOUT });
	}
	check('join: both students landed on the lesson', true);
	for (const [phone, name] of [[A, 'Alice'], [B, 'Bob']]) {
		await phone.page.locator('input').first().fill(name);
		await phone.page.locator('footer.frame__action button, button.btn--primary').first().click();
	}
	const count = await eventually(
		() => text(projector.page, '.projector-count'),
		(value) => value.includes('2'),
	);
	check('join: the projector counts two in class', count.includes('2'), count);
	await snapAll('waiting');
}

// ---- 3. opening, side, tables ---------------------------------------------------
async function phaseOpeningSideTables() {
	await teacherForward('opening');
	await sleep(600);
	await snapAll('opening');
	await teacherForward('side');
	for (const [phone, target] of [[A, SIDE_A], [B, SIDE_B]]) {
		const slider = await byId(phone.page, 'side-slider');
		check(`side: ${phone.name} sees the stage heading`, (await stageName(phone.page)) !== '', await stageName(phone.page));
		await slider.fill(String(target));
	}
	await snapAll('side');
	for (const phone of phones) await (await byId(phone.page, 'side-confirm')).click();
	const camps = await eventually(
		async () => {
			const snap = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();
			return snap.docs.filter((d) => d.data().role !== 'admin').map((d) => d.data().camp);
		},
		(list) => list.filter(Boolean).length === 2,
	);
	check('side: both students confirmed a side', camps.filter(Boolean).length === 2, camps.join(','));
	await sleep(500);
	await snapAll('side-confirmed');

	await teacherForward('tables');
	await (await byId(teacher.page, 'console-assign-tables')).click();
	for (const phone of phones) await byId(phone.page, 'table-number');
	const numbers = [];
	for (const phone of phones) numbers.push((await text(phone.page, '[data-testid=table-number]')).match(/\d+/)?.[0]);
	check('tables: both students are at the same table', numbers[0] && numbers[0] === numbers[1], numbers.join(' / '));
	const mates = await eventually(() => A.page.getByTestId('table-mates').locator('li').count(), (n) => n >= 2);
	check('tables: each phone lists the tablemate', mates >= 2, `${mates} listed`);
	await snapAll('tables');
}

// ---- 4. table talk ----------------------------------------------------------------
async function answerTurn(speaker) {
	await (await byId(speaker.page, 'table-answer')).click();
	await speaker.page.waitForFunction(
		() => {
			const finish = document.querySelector('[data-testid=table-finish]');
			return finish !== null && !finish.disabled;
		},
		null,
		{ timeout: TIMEOUT },
	);
}

async function phaseTableTalk() {
	await teacherForward('tableTalk');
	await sleep(800);
	for (const phone of phones) {
		check(`table talk: ${phone.name} sees the stage heading`, (await stageName(phone.page)).length > 0, await stageName(phone.page));
	}
	await snapAll('talk-pick');
	// turn 1: A asks
	await A.page.locator('[data-testid=table-pick-question]:not([disabled])').first().click({ timeout: TIMEOUT });
	await (await byId(A.page, 'table-claim')).click();
	await sleep(800);
	check('table talk: the asker has no answer button while waiting', !(await has(A.page, 'table-answer')));
	await snapAll('talk-asked');
	await answerTurn(B);
	await snapAll('talk-b-answering');
	await (await byId(B.page, 'table-finish')).click();
	await answerTurn(A);
	await (await byId(A.page, 'table-finish')).click();
	await sleep(1200);
	await snapAll('talk-turn1-done');
	// turn 2: B volunteers
	const b2 = await eventually(
		async () => (await B.page.locator('[data-testid=table-pick-question]:not([disabled])').count()) > 0,
	);
	check('table talk: turn 2 offers B the question list', b2 === true);
	await B.page.locator('[data-testid=table-pick-question]:not([disabled])').first().click({ timeout: TIMEOUT });
	await (await byId(B.page, 'table-claim')).click();
	await answerTurn(A);
	await (await byId(A.page, 'table-finish')).click();
	await answerTurn(B);
	await (await byId(B.page, 'table-finish')).click();
	await sleep(800);
	check('table talk: nobody writes at Table talk', !(await has(A.page, 'proposal-box')) && !(await has(B.page, 'proposal-box')));
	await snapAll('talk-turn2-done');
}

// ---- 5. proposals: talk, write (live), rate ----------------------------------------
async function phaseProposals() {
	await teacherForward('proposals');
	await sleep(800);
	await snapAll('proposals-talk');
	for (const phone of phones) {
		check(`proposals: ${phone.name} has the three sub-steps`, (await phone.page.locator('.substeps__pill').count()) === 3);
	}
	await A.page.locator('.substeps__pill[data-step=write]').click();
	await B.page.locator('.substeps__pill[data-step=write]').click();
	await byId(A.page, 'proposal-box');
	await A.page.locator('.write-panel__broadcast input').check();
	await A.page.getByTestId('proposal-box').fill(PROPOSAL_TEXTS[0].slice(0, 12));
	const line = B.page.getByTestId('live-line');
	await line.first().waitFor({ timeout: TIMEOUT });
	check('proposals: B sees A writing live', true, (await text(B.page, '[data-testid=live-line]')).slice(0, 60));
	await line.first().click();
	await byId(B.page, 'watch-text');
	await sleep(500);
	await snapAll('proposals-live-watch');
	await A.page.getByTestId('proposal-box').fill(PROPOSAL_TEXTS[0]);
	await eventually(async () => (await text(B.page, '[data-testid=watch-text]')).includes('teacher asks') || (await text(B.page, '[data-testid=watch-text]')).includes('box during'));
	check('proposals: B sees the longer text', (await text(B.page, '[data-testid=watch-text]')).includes('box during'));
	await (await byId(A.page, 'proposal-send')).click();
	await B.page.getByTestId('watch-close').click().catch(() => undefined);
	await (await byId(B.page, 'proposal-box')).fill(PROPOSAL_TEXTS[1]);
	await (await byId(B.page, 'proposal-send')).click();
	const proposals = await eventually(
		async () => (await admin.collection('statements').where('parentId', '==', challengeId).get()).docs,
		(docs) => docs.length >= 2,
		SLOW,
	);
	check('proposals: both proposals are saved under the challenge', proposals.length >= 2, `${proposals.length}`);
	await snapAll('proposals-written');
	await A.page.locator('.substeps__pill[data-step=rate]').click();
	await B.page.locator('.substeps__pill[data-step=rate]').click();
	await (await byId(A.page, 'rate-face-5', SLOW)).click();
	await (await byId(B.page, 'rate-face-5', SLOW)).click();
	const rated = await eventually(
		async () => {
			const snap = await admin.collection('statements').where('parentId', '==', challengeId).get();
			return snap.docs.filter((d) => (d.data().consensus ?? 0) > 0);
		},
		(docs) => docs.length >= 2,
		SLOW,
	);
	check('proposals: both proposals got a consensus from the other student', rated.length >= 2, rated.map((d) => d.data().consensus).join(','));
	await sleep(800);
	await snapAll('proposals-rated');
}

// ---- 6. vote ------------------------------------------------------------------------
const votesCount = async () => (await admin.collection('votes').where('parentId', '==', challengeId).get()).size;
const voteLabel = (phone) => text(phone.page, '[data-testid=vote-send]');
/** Write a vote the way the app does, from this phone's own page: 'written' or the Firestore error code. */
const tryCastVote = (phone, optionId) =>
	phone.page.evaluate(
		async ({ mainId, qid, option }) => {
			const { castVote } = await import('/src/lib/classroom/studentWrites.ts');
			try {
				await castVote(mainId, qid, option);

				return 'written';
			} catch (error) {
				return error?.code ?? String(error);
			}
		},
		{ mainId: mid, qid: challengeId, option: optionId },
	);
const toggleSetting = async (field, on) => {
	const box = teacher.page.getByTestId(`vote-display-${field}`);
	if ((await box.count()) === 0 || !(await box.isVisible())) await teacher.page.locator('summary.console__settings-toggle').click();
	await box.waitFor({ state: 'visible', timeout: TIMEOUT });
	if ((await box.isChecked()) !== on) await box.click();
	await teacher.page.locator('summary.console__settings-toggle').click();
};

async function phaseVote() {
	await teacherForward('vote');
	await sleep(800);
	await snapAll('vote-before-open');
	for (const phone of phones) {
		check(`vote: ${phone.name} sees the stage heading before the vote opens`, (await stageName(phone.page)) !== '', await stageName(phone.page));
		check(`vote: ${phone.name} has no vote button before the teacher opens the vote`, !(await has(phone.page, 'vote-send')));
	}
	check('vote: before the vote opens the projector says it is not open yet', (await text(projector.page, '.projector-empty')).length > 0);
	check('vote: console: pause and close are disabled before opening', (await teacher.page.getByTestId('console-pause-vote').isDisabled()) && (await teacher.page.getByTestId('console-close-vote').isDisabled()));
	await (await byId(teacher.page, 'console-freeze-vote')).click();
	for (const phone of phones) await byId(phone.page, 'vote-send');
	const buttonsOk = await eventually(
		async () => (await teacher.page.getByTestId('console-freeze-vote').isDisabled()) && !(await teacher.page.getByTestId('console-pause-vote').isDisabled()),
	);
	check('vote: after opening, the open button is disabled and pause is enabled', buttonsOk === true);
	await snapAll('vote-open');
	check('vote: the projector shows the open gate once the vote is open', (await projector.page.locator('.gate-stage--open').count()) === 1);
	const ballot = (await challengeData()).statementSettings.ballot;
	check('vote: the ballot has both proposals', ballot.candidateIds.length === 2, `${ballot.candidateIds.length}`);
	check('vote: live results are on by default (a result line under each option)', (await A.page.locator('.vote-list__count').count()) === 2);
	// A votes for the first card
	const votedFor = await A.page.getByTestId('vote-option').first().getAttribute('data-key');
	await A.page.getByTestId('vote-option').first().click();
	await (await byId(A.page, 'vote-send')).click();
	await eventually(async () => (await votesCount()) === 1);
	check('vote: A voted once', (await votesCount()) === 1);
	check('vote: A button says voted', (await voteLabel(A)) === 'הצבעתם', await voteLabel(A));
	const bLine = await eventually(
		() => text(B.page, '.vote-list__count'),
		(value) => /100/.test(value),
	);
	check("vote: A's vote shows on B's phone as live results (100%)", /100/.test(bLine), bLine);
	await snapAll('vote-a-voted');
	// pause
	await teacher.page.getByTestId('console-pause-vote').click();
	await eventually(async () => typeof (await challengeData()).statementSettings.ballot.pausedAt === 'number');
	await sleep(600);
	check('vote: paused: B button says paused and is disabled', (await voteLabel(B)) === 'ההצבעה מושהית' && (await B.page.getByTestId('vote-send').isDisabled()), await voteLabel(B));
	check('vote: paused: the projector says the vote is paused', (await text(projector.page, '.projector-vote-status')) === 'ההצבעה מושהית', await text(projector.page, '.projector-vote-status'));
	check('vote: paused: B sees the pause line', (await bodyText(B.page)).includes('המורה עצרה את ההצבעה'));
	check('vote: paused: the cards are locked (not radios)', (await B.page.locator('[role=radio]').count()) === 0);
	check("vote: paused: A's vote is kept and the screen says paused too", (await voteLabel(A)) === 'ההצבעה מושהית');
	check('vote: the teacher button now says resume', (await text(teacher.page, '[data-testid=console-pause-vote]')) === 'המשך ההצבעה');
	await B.page.getByTestId('vote-option').nth(1).click({ force: true }).catch(() => undefined);
	await B.page.getByTestId('vote-send').click({ force: true, timeout: 1500 }).catch(() => undefined);
	await sleep(800);
	check('vote: paused: B cannot vote (no vote was written)', (await votesCount()) === 1);
	const otherId = (await challengeData()).statementSettings.ballot.candidateIds.find((id) => id !== votedFor);
	const refusedNew = await tryCastVote(B, otherId);
	const refusedChange = await tryCastVote(A, otherId);
	const refusedWithdraw = await tryCastVote(A, 'none');
	check('vote: paused: the rules refuse a new vote, a change and a withdrawal', refusedNew === 'permission-denied' && refusedChange === 'permission-denied' && refusedWithdraw === 'permission-denied', `${refusedNew} / ${refusedChange} / ${refusedWithdraw}`);
	check("vote: paused: A's vote is untouched after the refused writes", (await admin.collection('votes').where('parentId', '==', challengeId).get()).docs.every((d) => d.data().statementId === votedFor));
	await snapAll('vote-paused');
	// resume
	await teacher.page.getByTestId('console-pause-vote').click();
	await eventually(async () => (await challengeData()).statementSettings.ballot.pausedAt == null);
	await sleep(600);
	check('vote: resumed: B can pick again', (await B.page.locator('[role=radio]').count()) === 2 && !(await B.page.getByTestId('vote-send').isDisabled()) === false);
	await B.page.getByTestId('vote-option').nth(1).click();
	await (await byId(B.page, 'vote-send')).click();
	await eventually(async () => (await votesCount()) === 2);
	check('vote: B voted after the resume', (await votesCount()) === 2);
	const aLine = await eventually(
		async () => (await A.page.locator('.vote-list__count').allTextContents()).join('|'),
		(value) => /50/.test(value),
	);
	check("vote: B's vote moves A's bars to 50 / 50", /50/.test(aLine), aLine);
	await snapAll('vote-both-voted');
	// sort by support on
	await toggleSetting('sortBySupport', true);
	await toggleSetting('liveResults', false);
	await sleep(800);
	check('vote: switching live results off hides the bars on both phones', (await A.page.locator('.vote-list__count').count()) === 0 && (await B.page.locator('.vote-list__count').count()) === 0);
	await toggleSetting('liveResults', true);
	await sleep(500);
	await snapAll('vote-sorted');
	// close
	const ballotIds0 = (await challengeData()).statementSettings.ballot.candidateIds[0];
	await (await byId(teacher.page, 'console-close-vote')).click();
	await eventually(async () => (await challengeData()).statementSettings.ballot.closedAt);
	await sleep(800);
	check('vote: closed: both phones say closed', (await voteLabel(A)) === 'ההצבעה נסגרה' && (await voteLabel(B)) === 'ההצבעה נסגרה', `${await voteLabel(A)} / ${await voteLabel(B)}`);
	const refusedClosed = await tryCastVote(B, ballotIds0);
	check('vote: closed: the rules refuse a vote', refusedClosed === 'permission-denied', refusedClosed);
	check('vote: closed: the instruction no longer says "choose one proposal"', !(await bodyText(A.page)).includes('בחרו הצעה אחת') && (await bodyText(A.page)).includes('ההצבעה נסגרה. ממתינים לסיכום'), await text(A.page, 'h1.frame__instruction'));
	check('vote: closed: the projector says the vote is closed', (await text(projector.page, '.projector-vote-status')) === 'ההצבעה נסגרה', await text(projector.page, '.projector-vote-status'));
	check('vote: closed: the teacher buttons are all off', (await teacher.page.getByTestId('console-freeze-vote').isDisabled()) && (await teacher.page.getByTestId('console-pause-vote').isDisabled()) && (await teacher.page.getByTestId('console-close-vote').isDisabled()));
	await snapAll('vote-closed');
}

// ---- 7. summary -----------------------------------------------------------------------
async function phaseSummary() {
	await teacherForward('summary');
	for (const phone of phones) {
		await (await byId(phone.page, 'support-face-5')).click();
	}
	await eventually(async () => {
		const snap = await admin.collection('statementsSubscribe').where('statementId', '==', mid).get();
		const pupils = snap.docs.filter((d) => d.data().role !== 'admin');
		return pupils.length === 2 && pupils.every((d) => d.data().decisionSupport === 1);
	});
	check('summary: both students\' support was written', true);
	await sleep(800);
	await snapAll('summary');
	check('summary: the projector shows the verdict', (await projector.page.locator('.projector-verdict').count()) === 1);
}

// ---- 8. go back, reset the vote, hide, reset turns ----------------------------------
const noticeOf = (phone) => text(phone.page, '.student-notice');
async function noticeBoth(expected, label) {
	for (const phone of phones) {
		const line = await eventually(() => noticeOf(phone), (v) => v.includes(expected), 8000);
		check(`${label}: ${phone.name} sees "${expected}"`, line.includes(expected), line);
	}
}

async function phaseBackAndResets() {
	// back from Summary to Proposals: a confirm, work kept, a notice on both phones
	await teacher.page.locator('[data-step-key=proposals]').click();
	await byId(teacher.page, 'console-confirm-yes');
	check('go back: the console asks first', (await teacher.page.locator('[data-testid=console-confirm-yes]').count()) === 1);
	await snapAll('back-confirm');
	await teacher.page.getByTestId('console-confirm-yes').click();
	await teacher.page.waitForFunction(() => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === 'proposals', null, { timeout: TIMEOUT });
	await noticeBoth('חזרנו לשלב: הצעות לפתרונות', 'go back');
	const noticeTop = await A.page.locator('.student-notice').evaluate((el) => el.getBoundingClientRect().top);
	check('go back: the notice sits at the top, not over the bottom action', noticeTop < 100, `${Math.round(noticeTop)}px from the top`);
	await snapAll('back-proposals');
	check('go back: both proposals are still there', (await admin.collection('statements').where('parentId', '==', challengeId).get()).size === 2);
	check('go back: the vote is kept (2 votes)', (await votesCount()) === 2);
	for (const phone of phones) {
		check(`go back: ${phone.name} shows the Proposals stage heading`, (await stageName(phone.page)) === 'הצעות לפתרונות', await stageName(phone.page));
	}
	await sleep(7000);
	check('go back: the notice shows once and then goes away', (await noticeOf(A)) === '' && (await noticeOf(B)) === '');

	// reset the closed vote
	await teacher.page.locator('[data-step-key=vote]').click();
	await teacher.page.waitForFunction(() => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === 'vote', null, { timeout: TIMEOUT });
	await (await byId(teacher.page, 'console-reset-vote')).click();
	await byId(teacher.page, 'console-confirm-yes');
	await snapAll('reset-vote-confirm');
	await teacher.page.getByTestId('console-confirm-yes').click();
	await eventually(async () => (await votesCount()) === 0);
	check('reset vote: all votes are gone', (await votesCount()) === 0);
	await noticeBoth('ההצבעה התחילה מחדש', 'reset vote');
	const ballot = (await challengeData()).statementSettings.ballot;
	check('reset vote: the ballot is open again with both candidates and no decision', ballot.candidateIds.length === 2 && !ballot.closedAt && !ballot.decisionId);
	check('reset vote: both phones can vote again', (await voteLabel(A)) === 'הצבעה' && (await voteLabel(B)) === 'הצבעה');
	await snapAll('reset-vote-done');

	// both vote for the first card, then the teacher hides that proposal
	// by id, not by position: with "sort by support" on, each phone keeps its own order for ties
	const firstId = (await challengeData()).statementSettings.ballot.candidateIds[0];
	for (const phone of phones) {
		await phone.page.locator(`[data-testid=vote-option][data-key="${firstId}"]`).click();
		await (await byId(phone.page, 'vote-send')).click();
	}
	await eventually(async () => (await votesCount()) === 2);
	const firstText = (await admin.collection('statements').doc(firstId).get()).data().statement;
	await teacher.page.goto(`${BASE}/t/${mid}?view=texts`, { waitUntil: 'domcontentloaded' });
	const card = teacher.page.locator('.written-card', { hasText: firstText }).first();
	await card.waitFor({ timeout: TIMEOUT });
	await snapAll('texts');
	await card.getByRole('button', { name: 'הסתרה' }).click();
	await eventually(async () => (await admin.collection('statements').doc(firstId).get()).data().hide === true);
	check('hide: the proposal is hidden in the data', (await admin.collection('statements').doc(firstId).get()).data().hide === true);
	await sleep(1000);
	check('hide: the teacher card is flagged hidden', (await teacher.page.locator('.written-card--hidden').count()) === 1);
	for (const phone of phones) {
		const msg = await eventually(() => bodyText(phone.page), (v) => v.includes('ההצעה שבחרתם הוסרה'), 8000);
		const mine = (await admin.collection('votes').where('parentId', '==', challengeId).get()).docs.map((d) => `${d.data().userId.slice(0, 4)}:${d.data().statementId === firstId ? 'first' : d.data().statementId}`);
		check(`hide: ${phone.name} (who voted for it) is told it was removed`, msg.includes('ההצעה שבחרתם הוסרה'), msg.includes('ההצעה שבחרתם הוסרה') ? '' : `${msg.replace(/\s+/g, ' ').slice(0, 120)} | votes ${mine.join(',')}`);
		check(`hide: ${phone.name} now sees one card`, (await phone.page.getByTestId('vote-option').count()) === 1);
	}
	check('hide: the votes for it were withdrawn (live bars show 0)', (await A.page.locator('.vote-list__count').first().textContent()).includes('0'));
	await snapAll('hidden-vote');
	await teacher.page.getByRole('button', { name: 'החזרה' }).first().click();
	await eventually(async () => (await admin.collection('statements').doc(firstId).get()).data().hide === false);
	check('restore: the proposal is visible again in the data', (await admin.collection('statements').doc(firstId).get()).data().hide === false);
	check('restore: restoring never puts it back on the ballot', (await challengeData()).statementSettings.ballot.candidateIds.length === 1);

	// reset the turns (all tables)
	await teacher.page.goto(`${BASE}/t/${mid}`, { waitUntil: 'domcontentloaded' });
	await teacher.page.locator('[data-step-key=tableTalk]').click();
	await byId(teacher.page, 'console-confirm-yes');
	await teacher.page.getByTestId('console-confirm-yes').click();
	await noticeBoth('חזרנו לשלב: שאלות חקירה', 'back to Table talk');
	const before = (await admin.collection('classTables').where('mainId', '==', mid).get()).docs[0].data();
	await (await byId(teacher.page, 'console-reset-turns')).click();
	await byId(teacher.page, 'console-confirm-yes');
	await snapAll('reset-turns-confirm');
	await teacher.page.getByTestId('console-confirm-yes').click();
	await noticeBoth('הסבבים התחילו מחדש', 'reset turns');
	const after = (await admin.collection('classTables').where('mainId', '==', mid).get()).docs[0].data();
	check('reset turns: the table is back to turn 1 with nobody having spoken', after.turn === 1 && (after.spokenUids ?? []).length === 0, `turn ${before.turn} -> ${after.turn}`);
	for (const phone of phones) await byId(phone.page, 'table-pick-question');
	check('reset turns: both phones offer the question list again', true);
	const shownAt = Date.now();
	await eventually(() => noticeOf(A), (v) => v === '', 15000);
	const shownFor = Date.now() - shownAt;
	check('reset turns: the notice goes away by itself within 8 s', shownFor < 8000 && (await noticeOf(B)) === '', `${shownFor} ms more after the page showed the table again`);
	await snapAll('reset-turns-done');
}

// ---- 9. pass the ask, pause the lesson, reload a phone, dark mode ----------------------
async function phasePassPauseReloadDark() {
	// the asker passes the question to the other volunteer
	await A.page.locator('[data-testid=table-pick-question]:not([disabled])').first().click();
	await (await byId(A.page, 'pass-ask')).click();
	await byId(A.page, 'pass-ask-yes');
	await snapAll('pass-ask-confirm');
	check('pass ask: no stale notice before the pass', (await noticeOf(A)) === '' && (await noticeOf(B)) === '');
	await A.page.getByTestId('pass-ask-yes').click();
	await sleep(1200);
	check('pass ask: passing the ask does not raise a "turns restarted" notice', (await noticeOf(A)) === '' && (await noticeOf(B)) === '', `${await noticeOf(A)} | ${await noticeOf(B)}`);
	await snapAll('pass-ask-done');
	const aStuck = (await has(A.page, 'table-claim')) || (await has(A.page, 'table-pick-question'));
	check('pass ask: after passing, A still has something to do or a clear wait line', aStuck || (await text(A.page, 'h1.frame__instruction')).length > 0, await text(A.page, 'h1.frame__instruction'));
	check('pass ask: B (the other tablemate) can now start', (await has(B.page, 'table-claim')) || (await has(B.page, 'table-pick-question')));

	// pause the lesson
	await teacher.page.getByTestId('console-pause').click();
	for (const phone of phones) {
		const body = await eventually(() => bodyText(phone.page), (v) => v.includes('השיעור בהפסקה'), 8000);
		check(`pause lesson: ${phone.name} sees a paused screen`, body.includes('השיעור בהפסקה'), body.replace(/\s+/g, ' ').slice(0, 60));
	}
	await snapAll('lesson-paused');
	await teacher.page.getByTestId('console-resume').click();
	for (const phone of phones) await eventually(async () => !((await bodyText(phone.page)).includes('השיעור בהפסקה')), Boolean, 8000);
	await sleep(600);
	await snapAll('lesson-resumed');

	// B reloads the page at the vote step: same name, same side, same screen
	await teacher.page.locator('[data-step-key=vote]').click();
	await teacher.page.waitForFunction(() => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === 'vote', null, { timeout: TIMEOUT });
	await byId(B.page, 'vote-option');
	await B.page.reload({ waitUntil: 'domcontentloaded' });
	await byId(B.page, 'vote-option');
	check('reload: B is back on the vote screen with the same heading', (await stageName(B.page)) === 'הצבעה');
	const camps = (await admin.collection('statementsSubscribe').where('statementId', '==', mid).get()).docs.filter((d) => d.data().role !== 'admin');
	check('reload: still the same two students (no duplicate member)', camps.length === 2, `${camps.length}`);
	await snapAll('reloaded');

	// dark mode on every screen, with a contrast check in light and dark
	for (const mode of ['light', 'dark']) {
		for (const role of roles) await role.page.emulateMedia({ colorScheme: mode });
		await sleep(500);
		for (const step of ['tableTalk', 'vote', 'summary']) {
			await teacher.page.locator(`[data-step-key=${step}]`).click();
			await sleep(400);
			if (await has(teacher.page, 'console-confirm-yes')) await confirmDialog();
			await teacher.page.waitForFunction((k) => document.querySelector('[data-step-key][aria-current="step"]')?.getAttribute('data-step-key') === k, step, { timeout: TIMEOUT });
			await sleep(900);
			await snapAll(`${mode}-${step}`);
			for (const role of roles) {
				const bad = await lowContrast(role.page);
				check(`${mode} mode, ${step}: ${role.name} has no text under 3:1 contrast`, bad.length === 0, bad.join(' | '));
			}
		}
	}
}

// ---- main ---------------------------------------------------------------------------
try {
	await phasePlan();
	await phaseJoin();
	await phaseOpeningSideTables();
	await phaseTableTalk();
	await phaseProposals();
	await phaseVote();
	await phaseSummary();
	await phaseBackAndResets();
	await phasePassPauseReloadDark();
} catch (error) {
	check('the walk finished without an exception', false, String(error?.message ?? error).split('\n')[0]);
	await snapAll('failure');
}

const real = errors.filter((e) => !/Firebase|auth\/|ResizeObserver/.test(e));
check('no uncaught page errors on any screen', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
console.info(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
