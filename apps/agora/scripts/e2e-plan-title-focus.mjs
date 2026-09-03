/* The question title in the plan editor is a door to its own text field:
 * pressing it opens the options with the title input focused, and a freshly
 * added question opens straight into typing.
 *
 * Run: npx tsx scripts/e2e-plan-title-focus.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { mkPage, shotter, step } from './lib/e2e.mjs';

await preflight();
const DIR = 'fastlane-shots';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `title-${Date.now().toString(36)}`;

const focusedIs = (page, selector) =>
	page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
const expect = (ok, what) => {
	if (!ok) throw new Error(`FAILED: ${what}`);
	console.log(`   ✓ ${what}`);
};

const browser = await chromium.launch();
try {
	step('teacher: start screen');
	const teacher = await mkPage(browser, 'teacher', { width: 1280, height: 1000 });
	await teacher.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
		`${runId}-teacher`,
	);
	await teacher.waitForTimeout(1500);
	await teacher.goto(`${VITE_HOST}/#!/teach/start`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.plan-editor', { timeout: 30_000 });
	const quickButton = teacher.locator('.teacher__mode-row button', { hasText: 'משחק מהיר' }).first();
	if (await quickButton.count()) await quickButton.click();
	await teacher.waitForTimeout(300);

	step('press the untitled question title');
	const title = teacher.locator('button.plan-editor__title').first();
	expect((await title.count()) > 0, 'the question title renders as a button');
	await shot(teacher, 'title-before');
	await title.click();
	await teacher.waitForSelector('.plan-editor__item--open input.plan-editor__text', { timeout: 5_000 });
	expect(await focusedIs(teacher, 'input.plan-editor__text'), 'pressing the title focuses the title input');
	await teacher.keyboard.type('מה נאכל בטיול?');
	await teacher.waitForTimeout(200);
	const shown = await teacher.locator('button.plan-editor__title').first().innerText();
	expect(shown.includes('מה נאכל'), `typing updates the row title (${shown})`);
	await shot(teacher, 'title-after-typing');

	step('add a second question → opens straight into typing');
	await teacher.locator('.plan-editor__add > button').click();
	await teacher.locator('.plan-editor__add-menu button', { hasText: 'שאלה' }).first().click();
	await teacher.waitForTimeout(300);
	const openItems = teacher.locator('.plan-editor__item--open');
	expect((await openItems.count()) === 1, 'exactly one item is open after adding');
	expect(await focusedIs(teacher, 'input.plan-editor__text'), 'the new question opens with its title input focused');
	const openTitle = await openItems.locator('button.plan-editor__title').innerText();
	expect(openTitle.includes('כתבו את השאלה'), `the open item is the new, untitled one (${openTitle})`);
	await shot(teacher, 'title-added-question');
	console.log('\n   all green');
} finally {
	await browser.close();
}
