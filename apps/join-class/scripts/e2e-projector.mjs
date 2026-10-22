// End-to-end run of the projector modes (IA 15 / UX 15): one screen, two screens,
// full-screen video, the idle control, and the busy labels.
//
//   # repo root: auth + firestore + database + functions emulators on your own ports
//   # apps/join-class: vite wired to the same ports (see e2e-console.mjs)
//   E2E_AUTH_PORT=9139 E2E_FIRESTORE_PORT=8139 JOIN_CLASS_URL=http://localhost:3039 \
//     node scripts/e2e-projector.mjs
//
// Fullscreen cannot be truly entered headless, so a page-level spy replaces
// Element.prototype.requestFullscreen and counts the calls. The busy-label check
// needs the classroom callables (functions emulator); it delays classSetLessonStatus.
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

const TIMEOUT = 20000;
const IDLE_WAIT = 3600; // control idle is 3 s
const HINT_WAIT = 14500; // hint 10 s, then the idle 3 s
const RUN = Date.now();

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const adminDb = getFirestore();

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seed(args) {
	execFileSync('npx', ['tsx', 'apps/join-class/scripts/seed-classroom.ts', ...args], {
		cwd: REPO,
		stdio: 'ignore',
		env: process.env,
	});

	return JSON.parse(readFileSync(join(HERE, '.seed-output.json'), 'utf8'));
}

const mainRef = (id) => adminDb.collection('statements').doc(id);

async function setStep(mid, index) {
	await mainRef(mid).update({ 'statementSettings.lessonPlan.stepIndex': index, lastUpdate: Date.now() });
}

const controlsState = (page) => page.locator('.projector').getAttribute('data-controls');

async function waitControls(page, state, timeout = TIMEOUT) {
	try {
		await page.waitForFunction(
			(want) => document.querySelector('.projector')?.getAttribute('data-controls') === want,
			state,
			{ timeout },
		);

		return true;
	} catch {
		return false;
	}
}

async function waitUrl(page, matcher) {
	try {
		await page.waitForURL(matcher, { timeout: TIMEOUT });

		return true;
	} catch {
		return false;
	}
}

const browser = await chromium.launch();

async function openConsole(seedOut) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		locale: 'he-IL',
	});
	// page-level spy: count requestFullscreen calls in every document of this context (popups too)
	await context.addInitScript(() => {
		window.__fsCalls = 0;
		Element.prototype.requestFullscreen = function requestFullscreen() {
			window.__fsCalls += 1;

			return Promise.resolve();
		};
	});
	const page = await context.newPage();
	page.on('pageerror', (e) => console.error('pageerror:', e.message));
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelector('#app, body') !== null);
	await page.evaluate(async (token) => {
		const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
		const { auth } = await import('/src/lib/firebase.ts');
		await authMod.signInWithCustomToken(auth, token);
	}, seedOut.teacher.customToken);
	await page.goto(`${BASE}/t/${seedOut.mainId}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });

	return { context, page };
}

async function openMenu(page) {
	if (!(await page.locator('.projector-menu').evaluate((el) => el.open))) {
		await page.locator('.projector-menu__toggle').click();
	}
}

const fsCalls = (page) => page.evaluate(() => window.__fsCalls);

try {
	const lesson = seed(['--step=1', `--id=pm-${RUN}`]);
	const mid = lesson.mainId;
	await mainRef(mid).update({
		'statementSettings.introVideos': [{ id: 'v1', title: 'Video one', url: 'https://youtu.be/abcDEF12345' }],
	});
	const { context, page } = await openConsole(lesson);
	const consoleUrl = `${BASE}/t/${mid}`;

	// ---- menu --------------------------------------------------------------
	await openMenu(page);
	check('menu has both actions, in order', (await page.locator('.projector-menu__item').allInnerTexts()).join('|') === 'מקרן בחלון נפרד|הצגה במסך הזה', (await page.locator('.projector-menu__item').allInnerTexts()).join('|'));
	check('help lines are attached to the actions', (await page.locator('[data-testid="projector-here"]').getAttribute('aria-describedby')) === 'projector-help-here');
	const title = await page.locator('.console__title').boundingBox();
	check('lesson title keeps room in the bar at 1280', Boolean(title) && title.width > 100, String(title?.width));
	await page.keyboard.press('Escape');
	check('Escape closes the menu', !(await page.locator('.projector-menu').evaluate((el) => el.open)));

	// ---- one screen --------------------------------------------------------
	await openMenu(page);
	await page.locator('[data-testid="projector-here"]').click();
	check('one screen: "show on this screen" routes to the projector', await waitUrl(page, `${BASE}/t/${mid}/screen`));
	await page.waitForSelector('.projector-controls', { timeout: TIMEOUT });
	check('one screen: full screen was requested in the click', (await fsCalls(page)) >= 1, String(await fsCalls(page)));
	check('one screen: the control shows on arrival', await waitControls(page, 'on'));
	const backBtn = page.locator('.projector-controls [data-pc="back"]');
	check('one screen: "חזרה לשיעור" is there', (await backBtn.innerText()).trim().endsWith('חזרה לשיעור'));
	check('one screen: the control is a labelled group', (await page.locator('.projector-controls').getAttribute('aria-label')) === 'כפתורי המקרן');
	check('one screen: root is a region', (await page.locator('.projector').getAttribute('role')) === 'region');
	await page.waitForFunction(() => document.activeElement?.getAttribute('data-pc') === 'back', null, { timeout: 2000 }).then(
		() => check('one screen: focus lands on "חזרה לשיעור"', true),
		() => check('one screen: focus lands on "חזרה לשיעור"', false),
	);
	check('one screen: the code band is there at the Opening text', await page.waitForSelector('.projector-band__join', { timeout: TIMEOUT }).then(() => true, () => false));

	// idle hide, wake by >= 4 px, not by a step change
	check('control hides after 3 s idle', await waitControls(page, 'off', IDLE_WAIT + 1500));
	await page.mouse.move(300, 300);
	await page.mouse.move(302, 300);
	await sleep(250);
	check('a first move and a 2 px move do not wake it', (await controlsState(page)) === 'off');
	await page.mouse.move(340, 320);
	check('a move of 4 px or more wakes it', await waitControls(page, 'on', 2000));
	await waitControls(page, 'off', IDLE_WAIT + 1500);
	await setStep(mid, 2);
	await page.waitForSelector('.projector__stage[data-step="side"]', { timeout: TIMEOUT });
	await sleep(700);
	check('a step change does not wake the control', (await controlsState(page)) === 'off');
	await setStep(mid, 1);
	await page.waitForSelector('.projector__stage[data-step="opening"]', { timeout: TIMEOUT });

	// back by the button
	await page.mouse.move(500, 400);
	await page.mouse.move(540, 420);
	await waitControls(page, 'on', 2000);
	await backBtn.click();
	check('"חזרה לשיעור" returns to the console', await waitUrl(page, consoleUrl));
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });

	// back by Esc
	await openMenu(page);
	await page.locator('[data-testid="projector-here"]').click();
	await page.waitForSelector('.projector-controls', { timeout: TIMEOUT });
	await page.keyboard.press('Escape');
	check('Esc returns to the console', await waitUrl(page, consoleUrl));
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });

	// back by the browser
	await openMenu(page);
	await page.locator('[data-testid="projector-here"]').click();
	await page.waitForSelector('.projector-controls', { timeout: TIMEOUT });
	await page.goBack();
	check('browser back returns to the console', await waitUrl(page, consoleUrl));
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });

	// ---- video, one screen -------------------------------------------------
	await page.locator('[data-testid="projector-pick-1"]').click();
	await page.waitForFunction(() => document.querySelector('[data-testid="projector-pick-1"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: TIMEOUT });
	await openMenu(page);
	await page.locator('[data-testid="projector-here"]').click();
	await page.waitForSelector('.projector--video .intro-stage__strip', { timeout: TIMEOUT });
	check('video mode: no code band, no question line', (await page.locator('.projector-band').count()) === 0 && (await page.locator('.projector-question').count()) === 0);
	const strip = await page.locator('.intro-stage__strip').boundingBox();
	check('video mode: the strip is 64 px high', Math.round(strip?.height ?? 0) === 64, String(strip?.height));
	check('video mode: the strip carries the video label', (await page.locator('.intro-stage__title').innerText()).trim().endsWith('Video one'));
	const player = await page.locator('.intro-stage__player').boundingBox();
	check('video mode: the player is 16:9 above the strip', Boolean(player) && Math.abs(player.width / player.height - 16 / 9) < 0.02 && player.y + player.height <= (strip?.y ?? 0) + 1, JSON.stringify(player));
	check('video mode: the page does not scroll', await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight));
	await page.keyboard.press('Escape');
	await waitUrl(page, consoleUrl);
	await page.waitForSelector('.step-rail__next', { timeout: TIMEOUT });
	await page.locator('[data-testid="projector-pick-text"]').click();

	// ---- blocked pop-up ----------------------------------------------------
	await page.evaluate(() => {
		window.__realOpen = window.open;
		window.open = () => null;
	});
	await openMenu(page);
	await page.locator('[data-testid="projector-window"]').click();
	check('blocked pop-up: the inline message shows', await page.waitForSelector('.projector-menu__blocked[role="alert"]', { timeout: 3000 }).then(() => true, () => false));
	check('blocked pop-up: the menu stays open and nothing navigated', (await page.locator('.projector-menu').evaluate((el) => el.open)) && page.url() === consoleUrl);
	await page.evaluate(() => {
		window.open = window.__realOpen;
	});

	// ---- two screens -------------------------------------------------------
	const pages = [];
	context.on('page', (p) => pages.push(p));
	const popupPromise = context.waitForEvent('page', { timeout: TIMEOUT });
	await page.locator('[data-testid="projector-window"]').click();
	const popup = await popupPromise;
	await popup.waitForLoadState('domcontentloaded');
	await popup.waitForSelector('.projector-controls', { timeout: TIMEOUT });
	check('two screens: the popup shows the projector in window mode', popup.url().includes(`/t/${mid}/screen`) && popup.url().includes('mode=window'), popup.url());
	check('two screens: the console tab is untouched', page.url() === consoleUrl);
	check('two screens: the first-open hint shows', await popup.locator('[data-testid="projector-hint"]').isVisible());
	check('two screens: the buttons are "מסך מלא" and "סגירת המקרן"', (await popup.locator('.projector-controls button').allInnerTexts()).join('|') === 'מסך מלא|סגירת המקרן', (await popup.locator('.projector-controls button').allInnerTexts()).join('|'));
	check('two screens: no way to the console from the popup', (await popup.locator('.projector-controls [data-pc="back"]').count()) === 0);
	const popupSize = await popup.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
	check('two screens: the popup opens near 1280x720', popupSize.w >= 1000 && popupSize.h >= 500, JSON.stringify(popupSize));
	await popup.locator('[data-pc="fullscreen"]').click();
	check('two screens: "מסך מלא" requests full screen on the popup', (await fsCalls(popup)) >= 1);
	await popup.keyboard.press('Escape');
	check('two screens: Esc hides the control and never navigates', (await waitControls(popup, 'off', 2000)) && popup.url().includes('mode=window'));

	// pressing again reuses the window
	const before = pages.length;
	await openMenu(page);
	await page.locator('[data-testid="projector-window"]').click();
	await sleep(800);
	check('two screens: pressing again opens no second window and does not reload', pages.length === before && (await popup.evaluate(() => performance.getEntriesByType('navigation').length)) === 1 && !popup.isClosed());

	// the console picks video 1: the popup shows the video layout with the strip and no code band
	await page.locator('[data-testid="projector-pick-1"]').click();
	await popup.waitForSelector('.projector--video .intro-stage__strip', { timeout: TIMEOUT });
	check('two screens: video layout on the popup, strip and no code band', (await popup.locator('.projector-band__join').count()) === 0 && (await popup.locator('.intro-stage__strip').count()) === 1);
	await page.locator('[data-testid="projector-pick-text"]').click();
	await popup.waitForSelector('.projector__stage .projector-question', { timeout: TIMEOUT });
	check('two screens: back to the text and the code band', (await popup.locator('.projector-band__join').count()) === 1);

	// the control hides after the hint and the idle, wakes on a move, close closes
	check('two screens: the control hides after the hint and the idle', await waitControls(popup, 'off', HINT_WAIT + 2000));
	await popup.mouse.move(200, 200);
	await popup.mouse.move(260, 240);
	check('two screens: a mouse move wakes it', await waitControls(popup, 'on', 2000));
	const closed = new Promise((resolve) => popup.once('close', () => resolve(true)));
	await popup.locator('[data-pc="close"]').click();
	check('two screens: "סגירת המקרן" closes the window', await Promise.race([closed, sleep(5000).then(() => false)]));
	check('two screens: the console is still on the lesson', page.url() === consoleUrl && (await page.locator('.step-rail__next').isVisible()));

	// ---- busy label while pausing -----------------------------------------
	await page.route('**/classSetLessonStatus*', async (route) => {
		await sleep(2500);
		await route.continue();
	});
	await page.locator('[data-testid="console-pause"]').click();
	await page.waitForFunction(() => document.querySelector('[data-testid="console-pause"]')?.getAttribute('aria-busy') === 'true', null, { timeout: 5000 }).catch(() => undefined);
	const busyText = (await page.locator('[data-testid="console-pause"]').innerText()).trim();
	check('busy label while pausing reads "משהים…"', busyText === 'משהים…', busyText);
	await context.close();
} catch (err) {
	console.error('e2e-projector crashed:', err);
	failures += 1;
} finally {
	await browser.close();
}

console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
