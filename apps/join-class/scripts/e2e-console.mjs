// End-to-end run of the teacher console (lane C4) on its own emulator ports.
//
//   # repo root: auth + firestore + database emulators (rules off: classTables has no rule on this branch)
//   npx firebase emulators:start -c firebase.c4.local.json --project freedi-test --only auth,firestore,database
//   # apps/join-class: vite wired to the same ports
//   VITE_EMULATOR_AUTH_PORT=9134 VITE_EMULATOR_FIRESTORE_PORT=8134 VITE_EMULATOR_FUNCTIONS_PORT=5034 \
//     VITE_EMULATOR_DATABASE_PORT=9034 VITE_FIREBASE_PROJECT_ID=freedi-test npx vite --port 3034 --strictPort
//   # apps/join-class:
//   node scripts/e2e-console.mjs
//
// Env: JOIN_CLASS_URL (default http://localhost:3034), E2E_FIRESTORE_PORT, E2E_AUTH_PORT (see e2e-env.mjs),
//      E2E_ENGINE=1 once the classroom callables (C1) are emulated: the callable-backed
//      steps then assert their effect in Firestore instead of the inline error + retry.
// No `networkidle` anywhere (the app keeps listeners open).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';

const ENGINE = process.env.E2E_ENGINE === '1';
const TIMEOUT = 20000;
// a fresh workspace id per run: students get new random uids every seed, so re-using an id would pile up rosters
const RUN = Date.now();

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const adminDb = getFirestore();

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

function seed(args) {
	execFileSync('npx', ['tsx', 'apps/join-class/scripts/seed-classroom.ts', ...args], {
		cwd: REPO,
		stdio: 'ignore',
		env: process.env,
	});

	return JSON.parse(readFileSync(join(HERE, '.seed-output.json'), 'utf8'));
}

async function stepIndexOf(mainId) {
	const snap = await adminDb.collection('statements').doc(mainId).get();

	return snap.data()?.statementSettings?.lessonPlan?.stepIndex;
}

async function waitStep(mainId, expected) {
	const deadline = Date.now() + TIMEOUT;
	let current;
	while (Date.now() < deadline) {
		current = await stepIndexOf(mainId);
		if (current === expected) return true;
		await new Promise((r) => setTimeout(r, 150));
	}
	console.error(`stepIndex stayed ${current}, wanted ${expected}`);

	return false;
}

const browser = await chromium.launch();

async function openConsole(seedOut, path = '') {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		locale: 'he-IL',
	});
	const page = await context.newPage();
	page.on('dialog', (d) => void d.accept());
	page.on('pageerror', (e) => console.error('pageerror:', e.message));
	const calls = [];
	page.on('request', (req) => {
		const m = req.url().match(/\/(class[A-Za-z]+)(?:\?|$)/);
		if (m) calls.push(m[1]);
	});
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelector('#app, body') !== null);
	await page.evaluate(async (token) => {
		const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
		const { auth } = await import('/src/lib/firebase.ts');
		await authMod.signInWithCustomToken(auth, token);
	}, seedOut.teacher.customToken);
	await page.goto(`${BASE}/t/${seedOut.mainId}${path}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });

	return { context, page, calls };
}

try {
	// ---- 1. a whole lesson with the one forward control -----------------------
	const lesson = seed(['--step=0', `--id=c4lesson-${RUN}`]);
	{
		const { context, page } = await openConsole(lesson);
		check('rail has 8 step buttons in an ordered list', (await page.locator('ol[aria-label] button.step-rail__step').count()) === 8);
		check(
			'current step carries aria-current="step"',
			(await page.locator('.step-rail__step[aria-current="step"]').getAttribute('data-step')) === '0',
		);
		check('exactly one primary control in the rail, none in the bands below', (await page.locator('.step-rail .btn--primary').count()) === 1 && (await page.locator('.switch-band .btn--primary, .console__board .btn--primary').count()) === 0);
		const width = await page.locator('.step-rail__next').evaluate((el) => el.getBoundingClientRect().width);
		check('forward control is 320 px wide', Math.round(width) === 320, String(width));
		check('join code chip is shown', (await page.locator('.console__code-value').innerText()).trim() === lesson.classCode);

		for (let i = 0; i < 7; i += 1) {
			await page.locator('.step-rail__next').click();
			check(`forward control writes stepIndex ${i + 1}`, await waitStep(lesson.mainId, i + 1));
			await page.waitForSelector(`.step-rail__step[data-step="${i + 1}"][aria-current="step"]`, { timeout: TIMEOUT });
		}
		check(
			'last step offers "end the lesson" (no primary)',
			(await page.locator('.step-rail .btn--primary').count()) === 0,
		);

		await page.locator('.step-rail__step[data-step="6"]').click();
		check('clicking a rail step goes back one step', await waitStep(lesson.mainId, 6));
		await page.waitForSelector('.step-rail__step[data-step="6"][aria-current="step"]', { timeout: TIMEOUT });
		await page.locator('.step-rail__next').click();
		check('forward again to the last step', await waitStep(lesson.mainId, 7));
		await page.waitForSelector('.step-rail__step[data-step="7"][aria-current="step"]', { timeout: TIMEOUT });
		await page.locator('.step-rail__next').click();
		// the last step's forward control opens the end choice (a native dialog, not window.confirm)
		await page.waitForSelector('dialog.end-choice[open]', { timeout: TIMEOUT });
		await page.click('[data-choice=end]');
		await page.waitForURL((u) => u.pathname === '/t', { timeout: TIMEOUT });
		check('end the lesson returns to the lesson list', true);
		await context.close();
	}

	// ---- 2. split into tables (callable) --------------------------------------
	const splitSeed = seed(['--step=3', `--id=c4split-${RUN}`]);
	{
		const { context, page, calls } = await openConsole(splitSeed);
		await page.waitForFunction((n) => document.querySelectorAll('.roster-card .member-chip').length === n, splitSeed.students.length, { timeout: TIMEOUT });
		check('roster card lists the joined students', (await page.locator('.roster-card .member-chip').count()) === splitSeed.students.length);
		await page.locator('[data-action="assign"]').click();
		await page.waitForTimeout(1500);
		check('split button dispatched classAssignTables', calls.includes('classAssignTables'));
		if (ENGINE) {
			await page.waitForSelector('.table-card', { timeout: TIMEOUT });
			check('engine: tables appear after the split', (await page.locator('.table-card').count()) > 0);
		} else {
			check('no engine: inline error with retry, no crash', (await page.locator('.console__failure button').count()) >= 1);
		}
		await context.close();
	}

	// ---- 3. seated class: keyboard move, pointer move, menu, sheet, gate, texts -
	const seated = seed(['--step=5', '--seated', '--proposals', `--id=c4seat-${RUN}`]);
	{
		const { context, page, calls } = await openConsole(seated);
		await page.waitForSelector('.table-card', { timeout: TIMEOUT });
		check('one card per seeded table', (await page.locator('.table-card').count()) === seated.tables.length);
		const uid = seated.tables[0].memberUids[0];
		const chip = page.locator(`button.member-chip[data-uid="${uid}"]`);

		// keyboard path
		await chip.focus();
		await page.keyboard.press('Space');
		await page.waitForFunction(() => /\S/.test(document.querySelector('.tables-board__live')?.textContent ?? ''), null, { timeout: TIMEOUT });
		check('Space picks the chip up (announced)', true);
		await page.keyboard.press('ArrowDown');
		await page.waitForSelector('.table-card--over', { timeout: TIMEOUT });
		check('arrow highlights a target table', (await page.locator('.table-card--over').count()) === 1);
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => document.querySelectorAll('.table-card--target').length === 0, null, { timeout: TIMEOUT });
		check('Escape cancels (no dashed targets left)', true);
		const callsBefore = calls.filter((c) => c === 'classMoveStudent').length;
		await chip.focus();
		await page.keyboard.press('Space');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Space');
		await page.waitForTimeout(1500);
		check(
			'keyboard drop dispatched classMoveStudent',
			calls.filter((c) => c === 'classMoveStudent').length === callsBefore + 1,
		);
		if (ENGINE) {
			const t2 = (await adminDb.collection('classTables').doc(seated.tables[1].tableId).get()).data();
			check('engine: student sits at the second table', t2?.memberUids?.includes(uid) === true);
		} else {
			check('no engine: move failure shows inline retry', (await page.locator('.console__failure').count()) === 1);
		}

		// pointer path (drag to the last card)
		const uid2 = seated.tables[1].memberUids[0];
		const before2 = calls.filter((c) => c === 'classMoveStudent').length;
		const from = await page.locator(`button.member-chip[data-uid="${uid2}"]`).boundingBox();
		const to = await page.locator('.table-card').last().boundingBox();
		if (from && to) {
			await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
			await page.mouse.down();
			await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 8 });
			check('pointer drag shows a ghost and dashed targets', (await page.locator('.chip-ghost').count()) === 1 && (await page.locator('.table-card--target').count()) > 0);
			await page.mouse.up();
			await page.waitForTimeout(1200);
			check('pointer drop dispatched classMoveStudent', calls.filter((c) => c === 'classMoveStudent').length === before2 + 1);
		} else {
			check('pointer drag geometry available', false);
		}

		// chip menu
		await page.locator(`button.member-chip__menu`).first().click();
		await page.waitForSelector('.member-chip__select', { timeout: TIMEOUT });
		check('chip menu opens a table select', (await page.locator('.member-chip__select').count()) === 1);
		await page.keyboard.press('Escape');

		// gate panel
		check('gate panel lists one row per proposal', (await page.locator('.gate-panel__row').count()) === seated.proposalIds.length);
		check('gate rows carry a verdict in words', (await page.locator('.gate-panel__note').first().innerText()).trim().length > 0);

		// the console settings gate slider moves the gate the console, projector and engine read
		await page.click('.console__settings-toggle');
		await page.waitForSelector('[data-testid=gate-slider]', { timeout: TIMEOUT });
		await page.locator('[data-testid=gate-slider]').fill('0.8');
		const gateWritten = await (async () => {
			const end = Date.now() + TIMEOUT;
			while (Date.now() < end) {
				const snap = await adminDb.collection('statements').doc(seated.mainId).get();
				if (snap.data()?.votingSettings?.threshold === 0.8) return true;
				await new Promise((r) => setTimeout(r, 250));
			}

			return false;
		})();
		check('the console settings gate slider writes votingSettings.threshold on the lesson', gateWritten);
		await page.keyboard.press('Escape');
		await page.waitForFunction(
			() => (document.querySelector('.gate-panel__gate')?.textContent ?? '').includes('0.80'),
			null,
			{ timeout: TIMEOUT },
		);
		check('the gate line on the console moved to 0.80', true);

		// switch band at proposals
		check('plenum button is offered at proposals', (await page.locator('[data-action="plenum"]').count()) === 1);

		// what they wrote
		await page.locator('[data-view="texts"]').click();
		await page.waitForSelector('.written-card', { timeout: TIMEOUT });
		check('"what they wrote" shows cards', (await page.locator('.written-card').count()) > 0);
		check('view is carried in the URL', page.url().includes('view=texts'));
		await context.close();
	}

	// ---- 3b. toggling the sheet keeps the console session (no skeleton, focus returns) ----
	{
		const { context, page } = await openConsole(seated);
		await page.waitForSelector('.table-card', { timeout: TIMEOUT });
		await page.evaluate(() => {
			window.__skeleton = false;
			new MutationObserver(() => {
				if (document.querySelector('.plan__skeleton')) window.__skeleton = true;
			}).observe(document.body, { childList: true, subtree: true });
		});
		await page.locator('.table-card__title').first().click();
		await page.waitForSelector('.table-sheet', { timeout: TIMEOUT });
		await page.keyboard.press('Escape');
		await page.waitForSelector('.table-sheet', { state: 'detached', timeout: TIMEOUT });
		await page.waitForSelector('.table-card', { timeout: TIMEOUT });
		check('sheet toggle never shows the loading skeleton', (await page.evaluate(() => window.__skeleton)) === false);
		const focused = await page.evaluate(() => document.activeElement?.className ?? '');
		check('focus returns to the opener when the sheet closes', String(focused).includes('table-card__title'), String(focused));
		await context.close();
	}

	// ---- 4. table sheet ---------------------------------------------------------
	{
		const { context, page } = await openConsole(seated, '/table/1');
		await page.waitForSelector('.table-sheet', { timeout: TIMEOUT });
		check('table sheet opens from the route', (await page.locator('.table-sheet__member').count()) >= 1);
		check('sheet is 420 px wide', Math.round(await page.locator('.table-sheet').evaluate((el) => el.getBoundingClientRect().width)) === 420);
		await page.keyboard.press('Escape');
		await page.waitForURL((u) => u.pathname === `/t/${seated.mainId}`, { timeout: TIMEOUT });
		await page.waitForSelector('.table-sheet', { state: 'detached', timeout: TIMEOUT });
		check('Escape closes the sheet', true);
		await context.close();
	}
} catch (err) {
	console.error('e2e crashed:', err);
	failures += 1;
} finally {
	await browser.close();
}

console.info(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
