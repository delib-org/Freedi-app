/* The scenario editor, in a browser: a teacher opens a scenario, edits every
 * field, presses Save and sees it took (and sees why when it did not), reopens
 * it to find the edits kept, marks it ready, publishes it to the library from a
 * phone, edits the published scenario and saves again, then edits the listing.
 *
 * Needs the private suite up (emulators + vite). By default the scenario is a
 * seeded draft; AGORA_SAVE_WIZARD=1 drafts it through the wizard instead, which
 * needs OPENAI_API_KEY in the functions env and takes a minute or two.
 * Screenshots go to output/scenario-save/.
 * Run: AGORA_VITE_HOST=http://localhost:3029 npm run e2e:save   (or `npm run solo -- ...`)
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, shotter, step } from './lib/e2e.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const DIR = 'output/scenario-save';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `save-${Date.now().toString(36)}`;
const emailOf = (sub) => `${runId}-${sub}@example.com`;
const WIZARD = process.env.AGORA_SAVE_WIZARD === '1';

step('A. an approved teacher');
const mk = async (sub, name) => {
	const who = await signInTeacher(`${runId}-${sub}`);
	await db.collection('usersV2').doc(who.uid).set({ email: emailOf(sub), displayName: name }, { merge: true });

	return { ...who, sub, name };
};
const admin = await mk('admin', 'Ada Admin');
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const author = await mk('author', 'Dana Cohen');
const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'Demo school' }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: emailOf('author') }, admin.idToken);
await callable('agoraLibraryAccess', {}, author.idToken);

const read = async (id) => (await db.collection('agoraTopicPackages').doc(id).get()).data();
/** The saved document once `ready` says so: a Save is confirmed by the database, not by the label (which can still read "Saved" from the last one) */
const settle = async (id, ready, what) => {
	for (let attempt = 0; attempt < 40; attempt++) {
		const data = await read(id);
		if (data && ready(data)) return data;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	fail(`never saved: ${what}`);
};
const browser = await chromium.launch();
let page;
try {
	page = await mkPage(browser, 'teacher', { width: 1280, height: 900, lang: 'en' });
	const signedIn = () => {
		const state = window.__agoraDebug?.().user;

		return Boolean(state && !state.loading && state.user && !state.user.isAnonymous);
	};
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
	await page.waitForFunction(
		() => {
			const state = window.__agoraDebug?.().user;

			return Boolean(state && state.loading === false && state.user);
		},
		{ timeout: 20_000 },
	);
	await page.evaluate((c) => window.__agoraDevSignIn(c), { sub: `${runId}-author`, email: emailOf('author'), name: 'Dana Cohen' });
	await page.waitForFunction(signedIn, { timeout: 20_000 });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForFunction(signedIn, { timeout: 20_000 });

	step('B. make a scenario');
	let id;
	if (WIZARD) {
		await page.goto(`${VITE_HOST}/#!/teach/scenarios/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('#scenario-statement').fill('Should phones be banned in class?');
		await page.locator('#scenario-description').fill('Weigh focus against trust, and find a rule both sides can live with.');
		await page.locator('button.btn--primary').click();
		await page.waitForURL(/#!\/teach\/scenarios\/(?!new)[^/]+$/, { timeout: 300_000 });
		id = page.url().split('/').pop();
	} else {
		const { visibility, library, stats, ...demo } = (await db.collection('agoraTopicPackages').doc('demo-french-revolution').get()).data() ?? {};
		if (!demo.scenes) fail('seed the demo package first (npm run seed:solo)');
		id = `${runId}-draft`;
		const now = Date.now();
		await db.collection('agoraTopicPackages').doc(id).set({ ...demo, topicPackageId: id, creatorId: author.uid, title: 'Phones in class', status: 'draft', language: 'en', createdAt: now, lastUpdate: now });
		await page.goto(`${VITE_HOST}/#!/teach/scenarios/${id}`, { waitUntil: 'domcontentloaded' });
	}
	console.log('   scenario', id);
	await page.waitForSelector('input.code-input', { timeout: 20_000 });
	await shot(page, '01-editor');

	step('C. edit every field in one burst, then Save');
	const bar = page.locator('.editor__actions');
	const saveButton = bar.locator('button.btn--secondary');
	const savedLabel = () => /Saved/.test(document.querySelector('.editor__actions button.btn--secondary')?.textContent ?? '');
	const characters = page.locator('h3').nth(0).locator('xpath=following-sibling::*[1]').locator('> .card');
	const scenes = page.locator('h3').nth(1).locator('xpath=following-sibling::*[1]').locator('> .card');
	// Fields typed faster than the screen redraws used to wipe each other out
	await page.locator('input.code-input').fill('Phones in class (edited)');
	await page.locator('textarea.text-input').nth(0).fill('New framing text');
	await page.locator('textarea.text-input').nth(1).fill('New challenge question?');
	const first = characters.nth(0);
	await first.locator('input.text-input').nth(0).fill('Ms Rivka');
	await first.locator('input.text-input').nth(1).fill('Head teacher');
	await first.locator('textarea').nth(0).fill('phones distract');
	await first.locator('textarea').nth(1).fill('to be heard');
	await first.locator('textarea').nth(2).fill('Focus | Learning needs attention');
	const scene = scenes.nth(0);
	await scene.locator('input.text-input').nth(0).fill('Scene one (edited)');
	await scene.locator('textarea').nth(0).fill('What happens in scene one');
	await scenes.filter({ hasText: 'Dialogue (one per line' }).first().locator('label:has-text("Dialogue") + textarea').fill('Rivka: hello\nNoa: hi');
	await shot(page, '02-edited');
	await saveButton.click();
	await page.waitForFunction(savedLabel, { timeout: 15_000 });
	const saved = await read(id);
	eq('title kept', saved.title, 'Phones in class (edited)');
	eq('framing kept', saved.framingText, 'New framing text');
	eq('challenge kept', saved.challengeQuestion, 'New challenge question?');
	eq('character name kept', saved.characters[0].name, 'Ms Rivka');
	eq('character role kept', saved.characters[0].role, 'Head teacher');
	eq('arguments kept', saved.characters[0].arguments.join('|'), 'phones distract');
	eq('needs kept', saved.characters[0].needs.join('|'), 'to be heard');
	eq('values kept', saved.characters[0].values.map((v) => `${v.label}/${v.description}`).join('|'), 'Focus/Learning needs attention');
	eq('scene title kept', saved.scenes[0].title, 'Scene one (edited)');
	eq('scene text kept', saved.scenes[0].text, 'What happens in scene one');
	eq('dialogue kept', saved.scenes.some((sc) => sc.dialogue.map((d) => `${d.speaker}:${d.line}`).join('|') === 'Rivka:hello|Noa:hi'), true);
	eq('the unsaved chip is gone', await page.locator('.teacher-nav__unsaved').count(), 0);

	step('D. Enter in a list box starts a new line (it used to be eaten)');
	const args = first.locator('textarea').nth(0);
	await args.click();
	await page.keyboard.press('End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('phones are a safety line');
	eq('the new line stays in the box', await args.inputValue(), 'phones distract\nphones are a safety line');
	await page.waitForSelector('.teacher-nav__unsaved', { timeout: 3_000 });
	console.log('   ✓ and the chip says unsaved');
	await args.blur();
	await saveButton.click();
	eq('two arguments saved', (await settle(id, (d) => d.characters[0].arguments.length === 2, 'arguments')).characters[0].arguments.length, 2);

	step('E. reopen: the edits are still there');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input.code-input', { timeout: 20_000 });
	eq('title after reload', await page.locator('input.code-input').inputValue(), 'Phones in class (edited)');
	eq('arguments after reload', await characters.nth(0).locator('textarea').nth(0).inputValue(), 'phones distract\nphones are a safety line');
	eq('scene after reload', await scenes.nth(0).locator('input.text-input').nth(0).inputValue(), 'Scene one (edited)');

	step('F. a save that fails says why, and keeps the edits');
	await page.locator('input.code-input').fill('Phones in class (v2)');
	await db.collection('agoraTopicPackages').doc(id).update({ creatorId: 'someone-else' });
	await saveButton.click();
	await page.waitForSelector('.editor__error', { timeout: 15_000 });
	console.log('   message:', await page.locator('.editor__error').first().innerText());
	eq('the button is usable again', await saveButton.isDisabled(), false);
	eq('the edit is still on screen', await page.locator('input.code-input').inputValue(), 'Phones in class (v2)');
	await page.waitForSelector('.teacher-nav__unsaved', { timeout: 3_000 });
	console.log('   ✓ and still marked unsaved');
	await shot(page, '03-save-failed');
	// leaving: Save and go back. A failed save must keep the teacher here.
	page.once('dialog', (dialog) => void dialog.accept());
	await page.locator('.teacher-nav__back, button[aria-label="Back"]').first().click();
	await page.waitForTimeout(1500);
	eq('a failed save keeps the teacher on the editor', page.url().includes(`/teach/scenarios/${id}`), true);
	await db.collection('agoraTopicPackages').doc(id).update({ creatorId: author.uid });
	await saveButton.click();
	eq('after the account is right again it saves', (await settle(id, (d) => d.title === 'Phones in class (v2)', 'v2')).title, 'Phones in class (v2)');
	eq('the message cleared', await page.locator('.editor__error').count(), 0);
	await page.locator('input.code-input').fill('   ');
	await saveButton.click();
	await page.waitForSelector('.editor__error', { timeout: 5_000 });
	console.log('   empty title:', await page.locator('.editor__error').first().innerText());
	await page.locator('input.code-input').fill('Phones in class');

	step('G. mark ready');
	await bar.locator('button.btn--primary').click();
	await page.waitForFunction(() => document.querySelector('.editor__actions button.btn--primary') === null, { timeout: 15_000 });
	eq('status ready', (await read(id)).status, 'ready');
	eq('the title edit went with it', (await read(id)).title, 'Phones in class');

	step('H. publish from a phone: pressing Publish with things missing answers on screen');
	await page.setViewportSize({ width: 375, height: 700 });
	await page.goto(`${VITE_HOST}/#!/teach/scenarios`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.scenario-item', { timeout: 20_000 });
	const row = page.locator('.scenario-item', { hasText: 'Phones in class' });
	await row.locator('button.publish-pill').click();
	await row.locator('.scn-switch__opt:has-text("Public")').click();
	await page.waitForSelector('.scn-publish', { timeout: 10_000 });
	await page.locator('#scn-publish-summary').fill('Short');
	await page.locator('.question-sheet__continue').click();
	await page.waitForSelector('.scn-problems', { timeout: 5_000 });
	const inView = await page.locator('.scn-problems').evaluate((el) => {
		const r = el.getBoundingClientRect();

		return r.top >= 0 && r.bottom <= window.innerHeight;
	});
	await shot(page, '04-publish-missing-phone');
	eq('the list of what is missing is on screen', inView, true);
	console.log('   missing:', (await page.locator('.scn-problems li').allInnerTexts()).join(' | '));
	await shot(page, '04-publish-missing-phone');

	step('I. fill it in and publish');
	await page.locator('#scn-publish-summary').fill('The class decides together whether phones belong in lessons, and what a fair rule looks like.');
	await page.locator('#scn-publish-subjects-input').click();
	await page.locator('#scn-publish-subjects-input').fill(`Phones ${runId}`);
	await page.locator('.scn-suggest__create').click();
	await page.waitForSelector('.scn-tag--picked', { timeout: 40_000 });
	await page.locator('#scn-publish-lessons-input').click();
	await page.locator('#scn-publish-lessons-input').fill(`Civics ${runId}`);
	await page.locator('.scn-suggest__create').click();
	await page.waitForFunction(() => document.querySelectorAll('.scn-tag--picked').length >= 2, { timeout: 40_000 });
	// a dragged-in cover: uploaded, previewed, and kept on the card
	await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 600;
		canvas.height = 375;
		const context = canvas.getContext('2d');
		context.fillStyle = '#7350e3';
		context.fillRect(0, 0, 600, 375);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
		const transfer = new DataTransfer();
		transfer.items.add(new File([blob], 'cover.png', { type: 'image/png' }));
		const zone = document.querySelector('.scn-cover__zone');
		zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
		zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
	});
	await page.waitForSelector('.scn-cover__img', { timeout: 30_000 });
	await page.waitForFunction(() => !document.querySelector('.scn-cover__bar'), { timeout: 30_000 });
	await shot(page, '05-publish-filled-phone');
	await page.locator('.question-sheet__continue').click();
	await page.waitForFunction(() => !document.querySelector('.scn-publish'), { timeout: 40_000 });
	const published = await read(id);
	eq('public in Firestore', published.visibility, 'public');
	eq('listed', published.library.hidden, false);
	eq('the cover is on the card', Boolean(published.library.coverUrl), true);
	eq('the row says where it went', (await page.locator('.scn-notice').count()) >= 1, true);
	await shot(page, '06-published-phone');
	await page.setViewportSize({ width: 1280, height: 900 });

	step('J. it shows in the library');
	await page.goto(`${VITE_HOST}/#!/teach/library`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.scn-card', { timeout: 30_000 });
	eq('the library lists it', (await page.locator('.scn-card__title').allInnerTexts()).some((title) => title.includes('Phones in class')), true);

	step('K. edit the published scenario and save again');
	await page.goto(`${VITE_HOST}/#!/teach/scenarios/${id}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input.code-input', { timeout: 20_000 });
	await page.locator('input.code-input').fill('Phones in class (published, edited)');
	await saveButton.click();
	const again = await settle(id, (d) => d.title === 'Phones in class (published, edited)', 'published edit');
	eq('the edit reached the published scenario', again.title, 'Phones in class (published, edited)');
	eq('and it is still public', again.visibility, 'public');
	eq('with its listing untouched', again.library.summary.startsWith('The class decides'), true);

	step('L. edit the listing: Save');
	await page.goto(`${VITE_HOST}/#!/teach/scenarios`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.scenario-item', { timeout: 20_000 });
	const row2 = page.locator('.scenario-item', { hasText: 'Phones in class' });
	await row2.locator('button.publish-pill').click();
	await row2.locator('.scn-mine__controls button.btn--ghost').click();
	await page.waitForSelector('.scn-publish', { timeout: 10_000 });
	await page.locator('#scn-publish-summary').fill('A new summary: should phones stay in the bag, or on the desk?');
	await page.locator('.question-sheet__continue').click();
	await page.waitForFunction(() => !document.querySelector('.scn-publish'), { timeout: 40_000 });
	eq('the new summary is stored', (await read(id)).library.summary.startsWith('A new summary'), true);

	step('M. back to private');
	if ((await row2.locator('.scn-switch').count()) === 0) await row2.locator('button.publish-pill').click();
	await row2.locator('.scn-switch__opt:has-text("Private")').click();
	await row2.locator('.scn-mine__confirm button.btn--primary').click();
	eq('private again', (await settle(id, (d) => d.visibility === 'private', 'private')).visibility, 'private');
	console.log('\nALL STEPS PASSED');
} catch (error) {
	console.log('FAILED:', error.message);
	await page?.screenshot({ path: `${DIR}/failure.png` }).catch(() => {});
	process.exitCode = 1;
} finally {
	await browser.close();
}
