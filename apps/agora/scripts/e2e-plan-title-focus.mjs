/* The lesson builder (docs/ia/agora-lesson-builder.md): a question's card
 * opens its editor, its type is picked from a readable list, and a step added
 * at a "+" between two cards lands there and opens straight into typing.
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
	await teacher.waitForSelector('.scenario-list', { timeout: 30_000 });
	// "My own question" opens its own sheet; the question is written there
	// (a teacher with no scenarios of their own lands with the sheet already open)
	await teacher.waitForTimeout(500);
	if (!(await teacher.locator('.question-sheet__question').isVisible())) {
		await teacher.locator('.scenario-row--own .scenario-row__use').click();
	}
	await teacher.waitForSelector('.question-sheet__question', { timeout: 10_000 });
	await teacher.locator('.question-sheet__question').fill('מה נעשה בטיול השנתי?');
	await teacher.locator('.question-sheet__continue').click();
	await teacher.waitForSelector('.scenario-row--question-set', { timeout: 10_000 });
	// The plan editor waits behind "advanced settings" → "lesson steps"
	await teacher.locator('.start-game__advanced-summary').click();
	await teacher.locator('.start-game__group-head').first().click();
	await teacher.waitForSelector('.plan-editor', { timeout: 10_000 });
	await teacher.waitForTimeout(300);
	// The quick default is the WizCol plan (story, needs rounds); this script
	// exercises an open question too, so it starts from the quick-decision template.
	await teacher.locator('.plan-editor__template', { hasText: 'החלטה מהירה' }).first().click();
	await teacher.waitForTimeout(300);

	step('an untitled question says so on its card, and its card opens its editor');
	const untitled = teacher.locator('.plan-step--invalid').first();
	expect((await untitled.count()) > 0, 'the untitled question is marked on its card');
	await shot(teacher, 'title-before');
	await untitled.locator('button.plan-step__main').click();
	await teacher.waitForSelector('.plan-step--open textarea.step-editor__input--words', { timeout: 5_000 });
	await teacher.locator('.plan-step--open textarea.step-editor__input--words').focus();
	await teacher.keyboard.type('מה נאכל בטיול?');
	await teacher.waitForTimeout(200);
	const shown = await teacher.locator('.plan-step--open .plan-step__line').innerText();
	expect(shown.includes('מה נאכל'), `typing updates the card (${shown})`);
	expect((await teacher.locator('.plan-step--invalid').count()) === 0, 'the card is no longer marked');
	await shot(teacher, 'title-after-typing');

	step('the question type is a list of readable choices, not a select');
	expect((await teacher.locator('.plan-step--open select').count()) === 0, 'no native select in the editor');
	await teacher.locator('.plan-step--open .step-editor__choice', { hasText: 'חזון' }).click();
	await teacher.waitForTimeout(200);
	const chip = await teacher.locator('.plan-step--open .plan-step__chip').innerText();
	expect(chip.includes('חזון'), `the chip follows the type (${chip})`);
	await teacher.locator('.plan-step--open .step-editor__done').click();

	step('add a step between two steps → the sheet → a question opens straight into typing');
	const before = await teacher.locator('.plan-step').count();
	await teacher.locator('.plan-editor__insert-btn').first().click();
	await teacher.waitForSelector('.step-sheet__panel', { timeout: 5_000 });
	await shot(teacher, 'title-add-sheet');
	await teacher.locator('.step-sheet__option', { hasText: 'שאלה משלי' }).click();
	await teacher.waitForTimeout(300);
	expect((await teacher.locator('.plan-step').count()) === before + 1, 'one step was added');
	const openItems = teacher.locator('.plan-step--open');
	expect((await openItems.count()) === 1, 'exactly one step is open after adding');
	expect(
		await focusedIs(teacher, 'textarea.step-editor__input--words'),
		'the new question opens with its words focused',
	);
	const second = await teacher.locator('.plan-step').nth(1).locator('.plan-step__chip').innerText();
	expect(second.includes('שאלה משלי'), `it went where the "+" was, right after the entry (${second})`);
	await shot(teacher, 'title-added-question');
	console.log('\n   all green');
} finally {
	await browser.close();
}
