// Smoke test for the teacher home + "plan the questions" screen, against the
// emulators (auth + firestore are enough), with the app on JOIN_CLASS_URL.
// Ports: see e2e-env.mjs. Run from apps/join-class:
//
//   VITE_EMULATOR_AUTH_PORT=<auth> VITE_EMULATOR_FIRESTORE_PORT=<firestore> \
//     VITE_EMULATOR_FUNCTIONS_PORT=<functions> npx vite --port 3035 --strictPort
//   E2E_AUTH_PORT=<auth> E2E_FIRESTORE_PORT=<firestore> node scripts/e2e-plan.mjs
//
// Flow: teacher sign-in, create a lesson, write the challenge question, add 3
// table questions (Enter adds the next), reorder by keyboard and by drag, add a
// hint, press Save, reload, and see everything again. Then the phone layout
// and the console placeholder.
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';
import { startLessonViaPlan } from './lib/startLessonViaPlan.mjs';

const TIMEOUT = 15000;
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

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
	// 1. teacher sign-in (Google only; a custom token stands in for the popup)
	await signInTeacher(page, BASE, `teacher-plan-${Date.now()}`);

	// 2. teacher home: a first-time teacher has the name field open already
	// a lesson now comes from a game of a lesson plan (lib/startLessonViaPlan.mjs); this script
	// is about the lesson's own "plan the questions" screen, where that helper ends
	const title = `Lesson ${Date.now()}`;
	const { mainId: mid } = await startLessonViaPlan(page, BASE, { title });
	const planUrl = page.url();
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
	await page.click('.plan__tables .plan__add');
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

	// 10b. lesson details: the two character names (the video link moved to the introduction)
	const names = page.locator('.plan-details__name');
	await names.nth(0).fill('Dana');
	await names.nth(0).blur();
	await names.nth(1).fill('Yoav');
	await names.nth(1).blur();
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.plan-details__name', { timeout: TIMEOUT });
	check(
		'after reload: both names are saved',
		(await names.nth(0).inputValue()) === 'Dana' && (await names.nth(1).inputValue()) === 'Yoav',
	);
	check(
		'the video field is gone from the lesson details',
		(await page.locator('.plan-details__video').count()) === 0,
	);

	// 10c. the introduction: text with a bullet and bold, two videos, reorder, reload
	await page.setViewportSize({ width: 1100, height: 900 });
	await page.waitForFunction(() => document.querySelector('#intro-text')?.disabled === false, null, {
		timeout: TIMEOUT,
	});
	const intro = page.locator('#intro-text');
	const titles = await page.$$eval('.plan__section-title', (els) => els.map((e) => e.id));
	check(
		'the introduction sits between the challenge question and the table questions',
		titles.join('|') === 'plan-details-title|plan-challenge-title|plan-intro-title|plan-tables-title',
		titles.join('|'),
	);
	// Ctrl+B by the physical key (e.code), so it also works on a Hebrew layout
	await intro.fill('מילה');
	await intro.selectText();
	await page.keyboard.press('Control+KeyB');
	check('Ctrl+B wraps the selection in bold', (await intro.inputValue()) === '**מילה**', await intro.inputValue());
	const introText = 'השבוע שוקלים **לאסור טלפונים** בבית הספר\n- יונתן חושב שזה מפריע\n- נועה חושבת שזה עוזר';
	await intro.fill(introText);
	await page.waitForFunction(
		() => document.querySelector('.intro-editor__preview strong')?.textContent === 'לאסור טלפונים',
		null,
		{ timeout: TIMEOUT },
	);
	check('the preview shows the bold run', (await page.locator('.intro-editor__preview strong').innerText()) === 'לאסור טלפונים');
	check('the preview shows the bullets', (await page.locator('.intro-editor__preview li').count()) === 2);
	await intro.blur();
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });

	const addVideo = page.locator('.plan-videos .plan__add');
	await addVideo.click();
	await page.waitForSelector('.intro-video__url:focus', { timeout: TIMEOUT });
	await page.keyboard.type('https://vimeo.com/123456');
	await page.keyboard.press('Tab');
	await page.waitForSelector('.intro-video .plan-card__error[role=alert]', { timeout: TIMEOUT });
	check('a link that is not YouTube or an mp4 shows the inline error', true);
	const url1 = page.locator('.intro-video__url').nth(0);
	await url1.fill('https://youtu.be/dQw4w9WgXcQ');
	await page.waitForFunction(
		() => document.querySelectorAll('.intro-video .plan-card__error[role=alert]').length === 0,
		null,
		{ timeout: TIMEOUT },
	);
	check('the error clears the moment the link is valid', true);
	await url1.blur();
	await page.locator('.intro-video__title').nth(0).fill('סרטון ראשון');
	await page.locator('.intro-video__title').nth(0).blur();
	await addVideo.click();
	await page.waitForSelector('.intro-video:nth-child(2) .intro-video__url:focus', { timeout: TIMEOUT });
	await page.keyboard.type('https://example.com/second.mp4');
	await page.keyboard.press('Enter');
	await page.keyboard.type('שני');
	await page.keyboard.press('Enter');
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	const videoTitles = () =>
		page.$$eval('.intro-video__title', (els) => els.map((el) => el.value).join('|'));
	check('two videos with their titles', (await videoTitles()) === 'סרטון ראשון|שני', await videoTitles());

	// reorder by keyboard: the second video up
	await page.locator('.intro-video').nth(1).locator('.plan-card__handle').focus();
	await page.keyboard.press('ArrowUp');
	await page.waitForFunction(
		() => document.querySelector('.intro-video__title')?.value === 'שני',
		null,
		{ timeout: TIMEOUT },
	);
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	check('videos reorder by keyboard', (await videoTitles()) === 'שני|סרטון ראשון', await videoTitles());

	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelector('#intro-text')?.disabled === false, null, {
		timeout: TIMEOUT,
	});
	await page.waitForSelector('.intro-video', { timeout: TIMEOUT });
	check(
		'after reload: the introduction text is saved, bullets and bold intact',
		(await page.locator('#intro-text').inputValue()) === introText,
		await page.locator('#intro-text').inputValue(),
	);
	check('after reload: the videos are in the saved order', (await videoTitles()) === 'שני|סרטון ראשון', await videoTitles());
	check(
		'after reload: the first link is the mp4',
		(await page.locator('.intro-video__url').nth(0).inputValue()) === 'https://example.com/second.mp4',
	);
	// the text is stored as paragraph child Statements of the lesson (the canonical rich body)
	const kids = (
		await db
			.collection('statements')
			.where('parentId', '==', mid)
			.where('statementType', '==', 'paragraph')
			.get()
	).docs
		.map((d) => d.data())
		.sort((a, b) => a.order - b.order);
	check('the text is three paragraph child statements', kids.length === 3, String(kids.length));
	check(
		'paragraph 1 keeps the plain text and the bold in doc.contentHtml',
		kids[0]?.statement === 'השבוע שוקלים לאסור טלפונים בבית הספר' &&
			kids[0]?.doc?.contentHtml?.includes('<strong>לאסור טלפונים</strong>') === true,
	);
	check(
		'paragraphs 2 and 3 are bullet items',
		kids[1]?.blockType === 'li' && kids[1]?.doc?.listType === 'ul' && kids[2]?.blockType === 'li',
	);
	const lesson = (await db.collection('statements').doc(mid).get()).data();
	check(
		'the lesson holds introVideos and no videoUrl',
		lesson?.statementSettings?.introVideos?.length === 2 && lesson?.statementSettings?.videoUrl === undefined,
	);

	// 11. delete a question
	await page.locator('.plan__tables li.plan-card').nth(2).locator('.plan-card__delete').click();
	await page.waitForFunction(() => document.querySelectorAll('.plan__tables li.plan-card').length === 2, null, {
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
	check('teacher home lists the lesson under "פתוחים עכשיו" and its plan', rows.filter((r) => r.includes(title)).length === 2, rows.join(', '));
} catch (err) {
	failures += 1;
	console.error('E2E aborted:', err);
	await page.screenshot({ path: 'e2e-plan-failure.png', fullPage: true }).catch(() => undefined);
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.info(failures === 0 ? 'E2E PLAN: all green' : `E2E PLAN: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
