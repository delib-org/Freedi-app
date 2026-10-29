// The student frame is exactly one screen tall: every screen that uses it must scroll
// INSIDE `.frame__content`, never clip, and keep its footer action on screen.
// Phone 360x640, Hebrew (RTL), solid and game look. Auth + Firestore emulators only.
//
//   E2E_AUTH_PORT=9119 E2E_FIRESTORE_PORT=8101 JOIN_CLASS_URL=http://localhost:5391 \
//     E2E_SHOTS=/some/dir node scripts/e2e-frame-fit.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';

const TIMEOUT = 15000;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const SHOTS = process.env.E2E_SHOTS;
const VIEWPORT = { width: 360, height: 640 };
const LONG_QUESTION =
	'איך נוכל כיתה שלמה, כל אחד ואחת מאיתנו, לדאוג שאף ילד או ילדה לא יישארו מחוץ לחברה, לא בהפסקות, לא בקבוצות הוואטסאפ ולא בטיולים, גם כשיש מתחים וריבים ישנים בין חברים?';

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

function seedLesson(step, extra = []) {
	execFileSync(
		'npx',
		[
			'tsx',
			'apps/join-class/scripts/seed-classroom.ts',
			`--step=${step}`,
			'--students=8',
			'--tokens',
			...extra,
		],
		{ cwd: repoRoot, env: process.env, stdio: 'ignore' },
	);

	return JSON.parse(readFileSync(join(here, '.seed-output.json'), 'utf8'));
}

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

async function until(fn, ms = TIMEOUT) {
	const end = Date.now() + ms;
	for (;;) {
		const value = await fn();
		if (value) return value;
		if (Date.now() > end) return null;
		await new Promise((r) => setTimeout(r, 200));
	}
}

/** Measures one drawn frame. */
function measure(page) {
	return page.evaluate(() => {
		const frame = document.querySelector('.frame');
		const content = document.querySelector('.frame__content');
		const action = document.querySelector('.frame__action');
		if (!frame || !content) return null;
		const vh = window.innerHeight;
		const rect = (el) => el.getBoundingClientRect();
		const doc = document.documentElement;
		// scroll the content to its end, then see what the last child reaches
		content.scrollTop = content.scrollHeight;
		const last = content.lastElementChild;
		const cr = rect(content);

		return {
			vh,
			docScroll: doc.scrollHeight - vh,
			frameBottom: Math.round(rect(frame).bottom),
			scrolls: content.scrollHeight > content.clientHeight + 1,
			actionVisible: action ? rect(action).top >= 0 && Math.round(rect(action).bottom) <= vh : null,
			actionH: action ? Math.round(rect(action).height) : null,
			contentH: Math.round(cr.height),
			lastReachable: last ? Math.round(rect(last).bottom) <= Math.round(cr.bottom) + 1 : true,
			sideways: doc.scrollWidth > window.innerWidth,
			down: frame.classList.contains('frame--down'),
		};
	});
}

async function openStudent(browser, seed, index, look, anon = false) {
	const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'he-IL', hasTouch: true });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.info(`pageerror: ${e.message}`));
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await page.evaluate(
		async ({ token, anonymous }) => {
			const authMod = await import('/node_modules/.vite/deps/firebase_auth.js');
			const { auth } = await import('/src/lib/firebase.ts');
			if (anonymous) await authMod.signInAnonymously(auth);
			else await authMod.signInWithCustomToken(auth, token);
		},
		{ token: seed.students[index].customToken, anonymous: anon },
	);
	await page.goto(`${BASE}/m/${seed.mainId}`, { waitUntil: 'domcontentloaded' });
	await page.locator('.frame').waitFor({ timeout: TIMEOUT });
	await page.evaluate((l) => {
		if (l === 'solid') document.documentElement.setAttribute('data-look', 'solid');
		else document.documentElement.removeAttribute('data-look');
	}, look);
	await page.waitForTimeout(500);

	return page;
}

async function verify(page, name, look, expectScroll = null) {
	const tag = `${name} / ${look}`;
	const r = await measure(page);
	if (!r) return check(`${tag}: a student frame is drawn`, false);
	check(`${tag}: page does not scroll, frame fits the screen`, r.docScroll <= 0 && r.frameBottom <= r.vh, JSON.stringify({ docScroll: r.docScroll, frameBottom: r.frameBottom }));
	check(`${tag}: action footer fully visible`, r.actionVisible !== false, `h=${r.actionH}`);
	check(`${tag}: content reaches its last element`, r.lastReachable);
	check(`${tag}: no sideways scroll`, !r.sideways);
	if (expectScroll !== null) check(`${tag}: content scrolls inside the frame`, r.scrolls === expectScroll);
	if (SHOTS) {
		await page.evaluate(() => {
			const c = document.querySelector('.frame__content');
			if (c) c.scrollTop = 0;
		});
		await page.screenshot({ path: join(SHOTS, `${name}-${look}.png`) });
	}

	return r;
}

const browser = await chromium.launch();
try {
	for (const look of ['solid', 'game']) {
		// 0 waiting + the name form (student with no saved name)
		let seed = seedLesson(0);
		let page = await openStudent(browser, seed, 0, look, true);
		await verify(page, 'name-form', look);
		const input = page.locator('.name-entry__input');
		if (await input.count()) {
			const save = page.locator('[data-testid="name-save"]');
			check(`name-form / ${look}: Save disabled while empty`, await save.isDisabled());
			await input.focus();
			const box = await save.boundingBox();
			check(`name-form / ${look}: Save is next to the input and on screen`, !!box && box.y + box.height <= VIEWPORT.height);
		}
		await page.context().close();

		for (const [name, step, extra] of [
			['side', 2, []],
			['tables', 3, ['--seated']],
			['tabletalk', 4, ['--seated', '--proposals']],
			['proposals', 5, ['--seated', '--proposals']],
			['vote', 6, ['--seated', '--proposals']],
			['summary', 7, ['--seated', '--proposals', '--support']],
		]) {
			seed = seedLesson(step, extra);
			if (seed.challengeId) {
				await db.doc(`statements/${seed.challengeId}`).update({ statement: LONG_QUESTION });
			}
			page = await openStudent(browser, seed, 0, look);
			await verify(page, name, look);
			if (name === 'proposals') {
				// the three sub-steps: talk (face down), write, rate
				const pills = page.locator('.substeps__pill');
				const n = await pills.count();
				for (let i = 0; i < n; i += 1) {
					await pills.nth(i).click();
					await page.waitForTimeout(400);
					await page.evaluate((l) => {
						if (l === 'solid') document.documentElement.setAttribute('data-look', 'solid');
					}, look);
					await verify(page, `proposals-sub${i}`, look);
					const area = page.locator('[data-testid="proposal-box"] textarea, textarea').first();
					if (await area.count()) {
						await area.focus();
						await page.waitForTimeout(300);
						const send = page.locator('[data-testid="proposal-send"]');
						const sb = await send.boundingBox();
						// what is drawn on top at the textarea's centre and at the send button's centre?
						const top = await page.evaluate(() => {
							const at = (el) => {
								const r = el.getBoundingClientRect();
								const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));

								return !!hit && (hit === el || el.contains(hit));
							};
							const ta = document.querySelector('.write__area');
							const sd = document.querySelector('[data-testid="proposal-send"]');

							return { area: ta ? at(ta) : null, send: sd ? at(sd) : null };
						});
						check(
							`proposals-sub${i} / ${look}: textarea and send reachable while focused`,
							!!sb && sb.y + sb.height <= VIEWPORT.height && top.area === true && top.send === true,
							JSON.stringify(top),
						);
						if (SHOTS) await page.screenshot({ path: join(SHOTS, `proposals-write-focus-${look}.png`) });
					}
				}
			}
			if (name === 'proposals') {
				// the "all proposals" step and the paused / ended screen
				await db.doc(`statements/${seed.mainId}`).update({
					'statementSettings.lessonPlan.steps': [
						'waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'allProposals', 'vote', 'summary',
					],
					'statementSettings.lessonPlan.stepIndex': 6,
				});
				await page.waitForTimeout(800);
				await verify(page, 'allproposals', look);
				await db.doc(`statements/${seed.mainId}`).update({ 'statementSettings.lessonPlan.status': 'paused' });
				await until(async () => (await page.locator('.frame').count()) > 0);
				await page.waitForTimeout(800);
				await verify(page, 'lessonstate-paused', look);
			}
			await page.context().close();
		}
	}
} finally {
	await browser.close();
}
console.info(failures ? `\n${failures} check(s) FAILED` : '\nall frame-fit checks passed');
process.exit(failures ? 1 : 0);
