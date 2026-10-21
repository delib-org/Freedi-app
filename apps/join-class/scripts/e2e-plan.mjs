// Smoke test for the teacher home + "plan the questions" screen, against the
// emulators (auth + firestore are enough), with the app on JOIN_CLASS_URL.
// Ports: see e2e-env.mjs. Run from apps/join-class:
//
//   VITE_EMULATOR_AUTH_PORT=<auth> VITE_EMULATOR_FIRESTORE_PORT=<firestore> \
//     VITE_EMULATOR_FUNCTIONS_PORT=<functions> npx vite --port 3035 --strictPort
//   E2E_AUTH_PORT=<auth> E2E_FIRESTORE_PORT=<firestore> node scripts/e2e-plan.mjs
//
// Flow: guest sign-in, create a lesson, write the challenge question, add 3
// table questions (Enter adds the next), reorder by keyboard and by drag, add a
// hint, press Save, reload, and see everything again. Then the phone layout
// and the console placeholder.
import { chromium } from '@playwright/test';
import { BASE_URL as BASE } from './e2e-env.mjs';

const TIMEOUT = 15000;

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

async function texts() {
	return page.$$eval('li.plan-card .plan-card__text', (els) => els.map((el) => el.value));
}

try {
	// 1. guest sign-in
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
	await page.click('button.login__btn--guest', { timeout: TIMEOUT });
	await page.waitForURL((u) => u.pathname === '/', { timeout: TIMEOUT });

	// 2. teacher home: create a lesson
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.click('.teacher-home__new', { timeout: TIMEOUT });
	const title = `Lesson ${Date.now()}`;
	await page.fill('#teacher-new-title', title);
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });
	const planUrl = page.url();
	const mid = planUrl.split('/t/')[1].split('/')[0];
	check('new lesson opens the plan screen', true, planUrl);
	await page.waitForSelector('.plan__challenge', { timeout: TIMEOUT });
	check(
		'empty state shown',
		(await page.locator('.plan__empty').count()) === 1 && (await page.locator('li.plan-card').count()) === 0,
	);

	// 3. challenge question (created on first edit)
	const challenge = page.locator('.plan-card__text--challenge');
	await challenge.fill('How do we decide together?');
	await challenge.blur();
	await page.waitForFunction(
		() => document.querySelector('.plan-card__text--challenge')?.disabled === false,
		null,
		{ timeout: TIMEOUT },
	);

	// 4. three table questions; Enter adds the next one
	// Mithril redraws on the next frame, so wait for the new field to hold focus
	// before typing into it.
	const focusedNew = 'li.plan-card--new .plan-card__text:focus';
	await page.click('.plan__add');
	await page.waitForSelector(focusedNew, { timeout: TIMEOUT });
	await page.keyboard.type('Question A');
	await page.keyboard.press('Enter');
	await page.waitForFunction(
		() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '',
		null,
		{ timeout: TIMEOUT },
	);
	await page.keyboard.type('Question B');
	await page.keyboard.press('Enter');
	await page.waitForFunction(
		() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '',
		null,
		{ timeout: TIMEOUT },
	);
	await page.keyboard.type('Question C');
	await page.keyboard.press('Enter'); // opens a 4th, empty card
	await page.waitForFunction(() => document.querySelectorAll('li.plan-card').length >= 4, null, {
		timeout: TIMEOUT,
	});
	await page.locator('.plan__title').click(); // blur: the empty 4th card disappears
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll('li.plan-card .plan-card__text')]
				.map((el) => el.value)
				.join('|') === 'Question A|Question B|Question C',
		null,
		{ timeout: TIMEOUT },
	);
	check('three table questions in the order typed', (await texts()).join('|') === 'Question A|Question B|Question C');

	// 5. hint on the second question
	const hintB = page.locator('li.plan-card').nth(1).locator('.plan-card__hint');
	await hintB.fill('look for needs');
	await hintB.blur();

	// 6. reorder by keyboard: A down one -> B, A, C
	await page.locator('li.plan-card').nth(0).locator('.plan-card__handle').focus();
	await page.keyboard.press('ArrowDown');
	await page.waitForFunction(
		() => document.querySelector('li.plan-card .plan-card__text')?.value === 'Question B',
		null,
		{ timeout: TIMEOUT },
	);
	check('keyboard reorder', (await texts()).join('|') === 'Question B|Question A|Question C', (await texts()).join('|'));

	// 7. reorder by drag: C onto B -> C, B, A
	await page
		.locator('li.plan-card')
		.nth(2)
		.locator('.plan-card__handle')
		.dragTo(page.locator('li.plan-card').nth(0));
	await page.waitForFunction(
		() => document.querySelector('li.plan-card .plan-card__text')?.value === 'Question C',
		null,
		{ timeout: TIMEOUT },
	);
	check('drag reorder', (await texts()).join('|') === 'Question C|Question B|Question A', (await texts()).join('|'));

	// 8. Save is a confirmation: it turns into "saved"
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	check('save button turns into the saved state', true);

	// 9. reload: everything is still there, in order
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelectorAll('li.plan-card').length === 3, null, {
		timeout: TIMEOUT,
	});
	check('after reload: table questions in saved order', (await texts()).join('|') === 'Question C|Question B|Question A', (await texts()).join('|'));
	check(
		'after reload: challenge question',
		(await page.locator('.plan-card__text--challenge').inputValue()) === 'How do we decide together?',
	);
	const hints = await page.$$eval('li.plan-card .plan-card__hint', (els) => els.map((el) => el.value));
	check('after reload: hint on question B', hints.join('|') === '|look for needs|', hints.join('|'));

	// 10. phone layout: bar fixed at the bottom
	await page.setViewportSize({ width: 390, height: 800 });
	const bar = await page.locator('.plan__bar').boundingBox();
	check('phone: save bar fixed at the bottom', !!bar && Math.abs(bar.y + bar.height - 800) < 2, JSON.stringify(bar));
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	check('phone: no horizontal scroll', !overflow);

	// 10b. lesson details: video link (https only) and the two character names
	const video = page.locator('.plan-details__video');
	await video.fill('http://insecure.example/clip.mp4');
	await video.blur();
	await page.waitForSelector('.plan-details .plan-card__error[role=alert]', { timeout: TIMEOUT });
	check('a non-https video link shows the inline error', true);
	await video.fill('https://example.com/dilemma.mp4');
	await video.blur();
	const names = page.locator('.plan-details__name');
	await names.nth(0).fill('Dana');
	await names.nth(0).blur();
	await names.nth(1).fill('Yoav');
	await names.nth(1).blur();
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.plan-details__video', { timeout: TIMEOUT });
	check(
		'after reload: video link and both names are saved',
		(await page.inputValue('.plan-details__video')) === 'https://example.com/dilemma.mp4' &&
			(await names.nth(0).inputValue()) === 'Dana' &&
			(await names.nth(1).inputValue()) === 'Yoav',
	);

	// 11. delete a question
	await page.locator('li.plan-card').nth(2).locator('.plan-card__delete').click();
	await page.waitForFunction(() => document.querySelectorAll('li.plan-card').length === 2, null, {
		timeout: TIMEOUT,
	});
	check('delete removes the question', true);

	// 12. the console, then the teacher home lists the lesson
	await page.click('.plan__console');
	await page.waitForURL((u) => u.pathname === `/t/${mid}`, { timeout: TIMEOUT });
	await page.waitForSelector('.console [data-step-key][aria-current="step"]', { timeout: TIMEOUT });
	await page.click('.console__qr-btn');
	await page.waitForSelector('.console__qr svg, .console__qr canvas, .console__qr img', { timeout: TIMEOUT });
	check('console opens on the step rail and shows the QR', true);
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-home__row', { timeout: TIMEOUT });
	const rows = await page.$$eval('.teacher-home__row-title', (els) => els.map((e) => e.textContent));
	check('teacher home lists the lesson', rows.includes(title), rows.join(', '));
} catch (err) {
	failures += 1;
	console.error('E2E aborted:', err);
	await page.screenshot({ path: 'e2e-plan-failure.png', fullPage: true }).catch(() => undefined);
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.info(failures === 0 ? 'E2E PLAN: all green' : `E2E PLAN: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
