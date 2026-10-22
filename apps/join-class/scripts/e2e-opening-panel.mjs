// End-to-end run of the Opening panel on the teacher console (IA 15.13 / UX 15.L):
// the introduction text and videos on the board, a player on the teacher's computer,
// full screen on the row frame, and the projector chooser kept apart from it.
//
//   # repo root: auth + firestore + database + functions emulators on your own ports
//   # apps/join-class: vite wired to the same ports (see e2e-console.mjs)
//   E2E_AUTH_PORT=9140 E2E_FIRESTORE_PORT=8140 JOIN_CLASS_URL=http://localhost:3040 \
//     node scripts/e2e-opening-panel.mjs
//
// Fullscreen cannot be truly entered headless, so a page-level spy replaces
// Element.prototype.requestFullscreen and records which element asked.
// The paused-lesson check needs the classroom callables (functions emulator).
// No `networkidle` anywhere (the app keeps listeners open).
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const TIMEOUT = 20000;
const RUN = Date.now();
const SIZES = [
	{ width: 1280, height: 720 },
	{ width: 1024, height: 768 },
];
const LOCALES = [
	{ locale: 'he-IL', play: 'לצפות כאן', fullscreen: 'מסך מלא', title: 'הקדמה' },
	{ locale: 'en-US', play: 'Watch here', fullscreen: 'Full screen', title: 'Introduction' },
];
const TEXT = 'בשבוע שעבר המועצה החליטה לאסור טלפונים בהפסקות.';

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

const mainRef = (id) => adminDb.collection('statements').doc(id);
const projectorVideoId = async (mid) =>
	(await mainRef(mid).get()).data()?.statementSettings?.lessonPlan?.projectorVideoId ?? null;

const browser = await chromium.launch();
const axeSource = readFileSync(createRequire(join(REPO, 'package.json')).resolve('axe-core/axe.min.js'), 'utf8');

async function openConsole(seedOut, { width, height }, locale) {
	const context = await browser.newContext({ viewport: { width, height }, locale });
	await context.addInitScript((lang) => {
		localStorage.setItem('freedi_joinclass_lang', lang);
		window.__fsCalls = [];
		Element.prototype.requestFullscreen = function requestFullscreen() {
			window.__fsCalls.push(this.className);

			return Promise.resolve();
		};
	}, locale.slice(0, 2));
	// the clip never answers (a player that stays loading); the "bad" one is refused (a failed file)
	await context.route('https://example.com/clip.mp4', () => undefined);
	await context.route('https://example.com/bad.mp4', (route) => route.abort());
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

const fsCalls = (page) => page.evaluate(() => window.__fsCalls);
const noHScroll = (page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

try {
	const lesson = seed(['--step=1', `--id=op-${RUN}`]);
	const mid = lesson.mainId;
	await mainRef(mid).update({
		description: TEXT,
		'statementSettings.introVideos': [
			{ id: 'v1', title: 'Video one', url: 'https://youtu.be/abcDEF12345' },
			{ id: 'v2', title: 'Video two', url: 'https://example.com/clip.mp4' },
			{ id: 'v3', title: 'Video three', url: 'https://example.com/bad.mp4' },
		],
	});

	for (const size of SIZES) {
		for (const loc of LOCALES) {
			const tag = `${size.width}x${size.height} ${loc.locale.slice(0, 2)}`;
			const { context, page } = await openConsole(lesson, size, loc.locale);
			await page.waitForSelector('.opening-panel', { timeout: TIMEOUT });
			const panel = await page.locator('.opening-panel').boundingBox();
			const roster = await page.locator('.roster-card').boundingBox();
			check(`[${tag}] panel is beside the roster, panel on the start side`, Boolean(panel && roster) && roster.y < panel.y + panel.height && (loc.locale === 'he-IL' ? panel.x > roster.x : panel.x < roster.x), JSON.stringify({ panel, roster }));
			check(`[${tag}] heading, text and three video rows`, (await page.locator('.opening-panel__title').innerText()) === loc.title && (await page.locator('.opening-panel').innerText()).includes(TEXT) && (await page.locator('.intro-video-row').count()) === 3);
			check(`[${tag}] no horizontal scroll`, await noHScroll(page));
			check(`[${tag}] panel text is large (no tiny type)`, (await page.locator('.opening-panel .intro-text__p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 16);

			if (size.width === 1280 && loc.locale === 'he-IL') {
				await page.addScriptTag({ content: axeSource });
				const axe = await page.evaluate(async () => {
					const r = await window.axe.run('.console__board', { runOnly: ['wcag2a', 'wcag2aa'] });

					return r.violations.map((v) => `${v.id}:${v.nodes.length}`);
				});
				check('[axe] no wcag2a/aa violations on the board', axe.length === 0, axe.join(','));

				// ---- play here, never the projector -----------------------------
				const before = await projectorVideoId(mid);
				await page.locator('.intro-video-row').nth(0).getByRole('button', { name: loc.play }).click();
				check('"לצפות כאן" opens a player on the console', await page.waitForSelector('.intro-video-row__frame iframe', { timeout: 5000 }).then(() => true, () => false));
				check('the player is on the console, not full screen, 16:9', await page.locator('.intro-video-row__frame').evaluate((el) => !document.fullscreenElement && Math.abs(el.getBoundingClientRect().width / el.querySelector('iframe').getBoundingClientRect().height - 16 / 9) < 0.1));
				check('opening a console player does not change projectorVideoId', (await projectorVideoId(mid)) === before, String(before));
				check('no autoplay: the iframe src has no autoplay', !(await page.locator('.intro-video-row__frame iframe').getAttribute('src')).includes('autoplay=1'));
				if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
				const fsBtn = page.locator('.intro-video-row__fullscreen');
				check('"מסך מלא" button is beside the title and named with the label', (await fsBtn.count()) === 1 && (await fsBtn.getAttribute('aria-label')) === `${loc.fullscreen}: 1. Video one`, await fsBtn.getAttribute('aria-label'));
				check('the full screen button comes before the player in Tab order', await fsBtn.evaluate((b) => Boolean(b.compareDocumentPosition(document.querySelector('.intro-video-row__frame iframe')) & Node.DOCUMENT_POSITION_FOLLOWING)));
				await fsBtn.click();
				const calls = await fsCalls(page);
				check('"מסך מלא" requests full screen on the row frame (spy)', calls.length === 1 && calls[0].includes('intro-video-row__frame'), JSON.stringify(calls));
				check('the document itself never goes full screen', (await fsCalls(page)).every((c) => !c.includes('console')));

				// focus comes back to the button when the browser leaves full screen
				await page.locator('.opening-panel__title').focus();
				await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
				check('focus returns to "מסך מלא" when full screen ends', await page.evaluate(() => document.activeElement?.classList.contains('intro-video-row__fullscreen')));
				await page.keyboard.press('Escape');
				check('Esc outside full screen keeps the console and the player', page.url() === `${BASE}/t/${mid}` && (await page.locator('.intro-video-row__frame iframe').count()) === 1);

				// one player at a time
				await page.locator('.intro-video-row').nth(1).getByRole('button', { name: loc.play }).click();
				await page.waitForSelector('.intro-video-row__frame video', { timeout: 5000 });
				check('opening another video closes the first', (await page.locator('.intro-video-row__frame iframe').count()) === 0 && (await page.locator('.intro-video-row__frame').count()) === 1);
				check('a file video preloads metadata only', (await page.locator('.intro-video-row__frame video').getAttribute('preload')) === 'metadata');

				// a file that fails shows the teacher's text, not the phone's
				await page.locator('.intro-video-row').nth(2).getByRole('button', { name: loc.play }).click();
				check('a failed file shows the console text in its row', await page.waitForFunction(() => document.querySelector('.intro-video-row__note')?.textContent === 'הסרטון לא נטען. בדקו את הקישור בתכנון.', null, { timeout: 8000 }).then(() => true, () => false));
				await page.locator('.intro-video-row').nth(1).getByRole('button', { name: loc.play }).click();
				await page.waitForSelector('.intro-video-row__frame video', { timeout: 5000 });

				// ---- the projector chooser is a separate thing -------------------
				await page.locator('[data-testid="projector-pick-1"]').click();
				await page.waitForFunction(() => document.querySelector('[data-testid="projector-pick-1"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: TIMEOUT });
				check('the chooser drives the projector', (await projectorVideoId(mid)) === 'v1');
				check('the chooser does not close the open console player', (await page.locator('.intro-video-row__frame video').count()) === 1);
				check('the row shows the projector tag', (await page.locator('.intro-video-row--live').count()) === 1);
				await page.locator('[data-testid="projector-pick-text"]').click();
				await page.waitForFunction(() => document.querySelector('[data-testid="projector-pick-text"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: TIMEOUT });
				check('picking the text does not close it either', (await page.locator('.intro-video-row__frame video').count()) === 1 && (await projectorVideoId(mid)) === null);
				check('the chooser never opened a console player of its own', (await fsCalls(page)).length === 1);

				// ---- paused lesson: players stay usable, the chooser is held -----
				await page.locator('[data-testid="console-pause"]').click();
				await page.waitForSelector('[data-testid="console-resume"]', { timeout: 15000 }).then(
					async () => {
						check('paused: the panel play button stays enabled', await page.locator('.intro-video-row').nth(0).getByRole('button', { name: loc.play }).isEnabled());
						check('paused: the projector chooser is disabled', await page.locator('[data-testid="projector-pick-1"]').isDisabled());
						await page.locator('[data-testid="console-resume"]').click();
					},
					() => check('paused: lesson held (needs the functions emulator)', false),
				);
			}
			await context.close();
		}
	}

	// ---- a lesson with no introduction --------------------------------------
	const bare = seed(['--step=1', `--id=op-bare-${RUN}`]);
	await mainRef(bare.mainId).update({ description: '', 'statementSettings.introVideos': [] });
	const { context, page } = await openConsole(bare, SIZES[0], 'he-IL');
	await page.waitForSelector('.opening-panel', { timeout: TIMEOUT });
	check('no intro: the empty line shows', (await page.locator('.opening-panel__empty').innerText()).trim() === 'לשיעור הזה אין הקדמה.');
	check('no intro: no video rows, no edit link', (await page.locator('.intro-video-row').count()) === 0 && (await page.locator('.opening-panel__edit').count()) === 0);
	const board = await page.locator('.opening-panel').boundingBox();
	check('no intro: the panel is short, not a blank board', Boolean(board) && board.height < 160, String(board?.height));
	await page.locator('.opening-panel__add').click();
	check('no intro: the add link goes to the plan', await page.waitForURL(`${BASE}/t/${bare.mainId}/plan?focus=intro`, { timeout: TIMEOUT }).then(() => true, () => false));
	check('the plan focuses the introduction text box', await page.waitForFunction(() => document.activeElement?.id === 'intro-text', null, { timeout: 8000 }).then(() => true, () => false));
	await context.close();
} catch (err) {
	console.error('e2e-opening-panel crashed:', err);
	failures += 1;
} finally {
	await browser.close();
}

console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
