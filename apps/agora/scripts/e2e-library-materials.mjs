/* Library background materials, end to end.
 *
 * The teacher adds pasted text, a PDF (a real drag & drop) and a web link to a
 * scene in the lesson editor and sees what was read. A student opens the scene,
 * reads the materials and asks the AI helper: it answers from the materials,
 * says so when the answer is not in them, and the conversation survives a
 * reload. A second student has an empty, separate conversation, and cannot read
 * the first one's document. The 15-question allowance is enforced by the server.
 *
 * Run (against YOUR OWN emulator suite and vite):
 *   AGORA_AUTH_HOST=... AGORA_FIRESTORE_HOST=... AGORA_FUNCTIONS_HOST=... \
 *   AGORA_VITE_HOST=... FIRESTORE_EMULATOR_HOST=... FIREBASE_AUTH_EMULATOR_HOST=... \
 *     npx tsx apps/agora/scripts/e2e-library-materials.mjs
 * The link material is served from a local page: the Functions emulator is the
 * one place a server may fetch a local address (never in production).
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { FIRESTORE_REST, preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher } from './lib/fastlane.ts';

const { AgoraStage } = createRequire(import.meta.url)('@freedi/shared-types');
const HERE = dirname(fileURLToPath(import.meta.url));
const PDF = readFileSync(join(HERE, '../../../functions/src/agora/__tests__/fixtures/harbour.pdf'));
const SHOTS = process.env.MATERIALS_SHOTS ?? '/tmp/agora-materials-shots';
mkdirSync(SHOTS, { recursive: true });

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });
const runId = `mat-${Date.now().toString(36)}`;

const LIGHTHOUSE =
	'The lighthouse on Cape Orla was built in 1887 by the engineer Miriam Kessel. Its lamp could be seen from thirty kilometres away. The keeper climbed 212 steps every evening to light it.';
const PAGE = `<html><head><title>The Orla fish market</title></head><body><nav>menu menu</nav><article>${'The Orla fish market opens at dawn every Thursday, and the oldest stall belongs to the Haddad family. '.repeat(6)}</article></body></html>`;

const web = createServer((request, response) => {
	response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
	response.end(PAGE);
});
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
const LINK = `http://127.0.0.1:${web.address().port}/market`;

step('a lesson at perspectives with two bot classmates');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({ stage: AgoraStage.perspectives, students: 2, proposals: 0, quiet: true, runId, teacher });
const session = (await db.collection('agoraSessions').doc(run.sessionId).get()).data();
const topicId = session.topicPackageId;
// The seeded lesson belongs to the seeder; this teacher owns it for the run
await db.collection('agoraTopicPackages').doc(topicId).update({ creatorId: teacher.uid });
const scenes = (await db.collection('agoraTopicPackages').doc(topicId).get()).data().scenes;
const scene = scenes.find((candidate) => candidate.kind === 'perspectiveA');

// The seeded lesson is shared between runs: start from no materials
await db.collection('agoraSceneMaterials').doc(`${topicId}--${scene.sceneId}`).delete();

const browser = await chromium.launch();
try {
	step('the teacher adds text, a PDF by drag & drop, and a link in the lesson editor');
	const desk = await (await browser.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
	await desk.addInitScript(() => localStorage.setItem('agora_lang', 'en'));
	await desk.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await desk.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Dana' }),
		`${runId}-teacher`,
	);
	await desk.waitForSelector('.teacher-nav__title', { timeout: 15_000 });
	await desk.goto(`${VITE_HOST}/#!/teach/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
	const editor = desk.locator(`.materials-editor[data-scene="${scene.sceneId}"]`);
	await editor.waitFor({ timeout: 20_000 });
	await editor.scrollIntoViewIfNeeded();

	await editor.locator('input[type=text]').fill('The lighthouse');
	await editor.locator('textarea').fill(LIGHTHOUSE);
	await editor.getByRole('button', { name: 'Add the text' }).click();
	await editor.locator('.materials-editor__item').first().waitFor({ timeout: 15_000 });
	const textFacts = await editor.locator('.materials-editor__facts').first().innerText();
	if (!textFacts.includes(`${LIGHTHOUSE.length} characters read`)) fail(`text facts: ${textFacts}`);
	eq('a preview of what was read is shown', (await editor.locator('.materials-editor__preview').first().innerText()).startsWith('The lighthouse on Cape Orla'), true);

	// A real drop: build a File in the page and dispatch dragover + drop on the zone
	await editor.locator('.materials-editor__drop').evaluate((zone, base64) => {
		const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
		const transfer = new DataTransfer();
		transfer.items.add(new File([bytes], 'harbour-history.pdf', { type: 'application/pdf' }));
		zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
		zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
	}, PDF.toString('base64'));
	await editor.locator('.materials-editor__item').nth(1).waitFor({ timeout: 30_000 });
	const pdfFacts = await editor.locator('.materials-editor__facts').nth(1).innerText();
	if (!/characters read · 1 pages/.test(pdfFacts)) fail(`pdf facts: ${pdfFacts}`);

	// Errors are clear: not a PDF, an unreadable PDF, a bad link
	await editor.locator('.materials-editor__file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
	await desk.waitForSelector('.materials-editor__error', { timeout: 5000 });
	eq('a non-PDF is refused up front', await editor.locator('.materials-editor__error').innerText(), 'That file is not a PDF.');
	await editor.locator('.materials-editor__file').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not really a pdf') });
	await desk.waitForFunction(() => document.querySelector('.materials-editor__error')?.textContent?.includes('could not read that PDF'), null, { timeout: 30_000 });
	await editor.locator('input[type=url]').fill('ftp://nope');
	await editor.getByRole('button', { name: 'Add the link' }).click();
	await desk.waitForFunction(() => document.querySelector('.materials-editor__error')?.textContent?.includes('not valid'), null, { timeout: 15_000 });

	await editor.locator('input[type=url]').fill(LINK);
	await editor.getByRole('button', { name: 'Add the link' }).click();
	await editor.locator('.materials-editor__item').nth(2).waitFor({ timeout: 30_000 });
	await desk.screenshot({ path: `${SHOTS}/1-teacher-editor.png`, fullPage: false });

	const stored = (await db.collection('agoraSceneMaterials').doc(`${topicId}--${scene.sceneId}`).get()).data();
	eq('three materials stored (text, pdf, link)', stored.items.map((item) => item.kind).join(','), 'text,pdf,link');
	eq('the link title came from the page', stored.items[2].title, 'The Orla fish market');
	if (!stored.items[1].text.includes('harbour opened in 1912')) fail('the PDF text was not stored');
	if (stored.items[2].text.includes('menu menu')) fail('page chrome leaked into the link text');

	step('a student opens the scene, reads the materials, and asks the helper');
	const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
	await phone.addInitScript(() => localStorage.setItem('agora_lang', 'en'));
	await phone.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(phone).catch(() => {});
	await phone.waitForSelector('.scene__title', { timeout: 30_000 });
	await phone.locator('.materials__open').waitFor({ timeout: 20_000 });
	await phone.screenshot({ path: `${SHOTS}/0-student-scene.png` });
	await phone.locator('.materials__open').click();
	await phone.locator('.materials__item').nth(2).waitFor();
	eq('three materials are listed', await phone.locator('.materials__item').count(), 3);
	await phone.locator('.materials__item').first().getByRole('button', { name: 'Read' }).click();
	eq('the text can be read', (await phone.locator('.materials__text').first().innerText()).includes('1887'), true);
	const pdfHref = await phone.locator('.materials__item').nth(1).getByRole('link', { name: 'Open the PDF' }).getAttribute('href');
	if (!pdfHref || !pdfHref.includes('materials')) fail(`PDF link: ${pdfHref}`);
	await phone.locator('.materials__item').nth(2).getByRole('link', { name: 'Open the link' }).waitFor();
	eq('15 questions to start', (await phone.locator('.materials__left').innerText()).trim(), '15 of 15 questions left');

	const ask = async (page, question, expectedLeft) => {
		await page.locator('.materials__input').fill(question);
		await page.locator('.materials__form button[type=submit]').click();
		await page.waitForFunction((left) => document.querySelector('.materials__left')?.textContent?.startsWith(left), expectedLeft, { timeout: 90_000 });
	};

	await ask(phone, 'Who built the lighthouse, and in what year?', '14 of 15');
	const answer1 = await phone.locator('.materials__msg--ai .materials__msg-text').last().innerText();
	console.log('   answer 1:', answer1);
	eq('the answer comes from the materials', answer1.includes('1887'), true);

	await ask(phone, 'What is the capital of Peru?', '13 of 15');
	const unknown = phone.locator('.materials__msg--ai').last();
	console.log('   answer 2:', await unknown.locator('.materials__msg-text').innerText());
	eq('"not in the materials" is marked', await unknown.locator('.materials__flag').count(), 1);

	await ask(phone, 'Please write my note for the class about the harbour, I am too tired.', '12 of 15');
	console.log('   answer 3 (asked to write for the student):', await phone.locator('.materials__msg--ai .materials__msg-text').last().innerText());
	await phone.screenshot({ path: `${SHOTS}/2-student-sheet.png` });

	step('a refused word costs no question');
	await phone.locator('.materials__input').fill('you are a stupid idiot and I hate you, you piece of shit');
	await phone.locator('.materials__form button[type=submit]').click();
	await phone.locator('.materials__notice--error').waitFor({ timeout: 60_000 });
	eq('still 12 of 15', (await phone.locator('.materials__left').innerText()).startsWith('12 of 15'), true);
	console.log('   notice:', await phone.locator('.materials__notice--error').innerText());

	step('the conversation survives a reload');
	await phone.reload({ waitUntil: 'domcontentloaded' });
	await phone.waitForSelector('.scene__title', { timeout: 30_000 });
	await phone.locator('.materials__open').click();
	await phone.locator('.materials__msg').first().waitFor({ timeout: 20_000 });
	eq('six turns are back', await phone.locator('.materials__msg').count(), 6);
	eq('and the count', (await phone.locator('.materials__left').innerText()).startsWith('12 of 15'), true);

	step('a second student has a separate, empty conversation and cannot read the first');
	const chats = await db.collection('agoraMaterialChats').where('sessionId', '==', run.sessionId).get();
	eq('one conversation so far', chats.size, 1);
	const first = chats.docs[0];
	const other = run.bots[0];
	const denied = await fetch(`${FIRESTORE_REST}/agoraMaterialChats/${first.id}`, { headers: { authorization: `Bearer ${other.idToken}` } });
	eq('a classmate reading it is refused', denied.status, 403);
	const phoneB = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
	await phoneB.addInitScript(() => localStorage.setItem('agora_lang', 'en'));
	await phoneB.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(phoneB, 'Bo').catch(() => {});
	await phoneB.waitForSelector('.scene__title', { timeout: 30_000 });
	await phoneB.locator('.materials__open').click();
	await phoneB.locator('.materials__empty').waitFor({ timeout: 20_000 });
	eq('student B sees nobody\'s questions', await phoneB.locator('.materials__msg').count(), 0);
	eq('student B has the full allowance', (await phoneB.locator('.materials__left').innerText()).startsWith('15 of 15'), true);
	await phoneB.screenshot({ path: `${SHOTS}/3-student-b-empty.png` });

	step('the 15-question limit is enforced by the server');
	const botAsk = (question) =>
		callable('agoraAskMaterials', { sessionId: run.sessionId, sceneId: scene.sceneId, question, language: 'en' }, other.idToken);
	await db.collection('agoraMaterialChats').doc(`${run.sessionId}--${other.uid}`).set({
		sessionId: run.sessionId,
		userId: other.uid,
		used: 14,
		messages: [],
		lastUpdate: Date.now(),
	});
	const last = await botAsk('How many steps did the keeper climb?');
	eq('the 15th is answered', last.ok, true);
	eq('and the count is 15', last.used, 15);
	const over = await botAsk('And what colour was the lamp?');
	eq('the 16th is refused', `${over.ok},${over.reason}`, 'false,limit');
	const doc = (await db.collection('agoraMaterialChats').doc(`${run.sessionId}--${other.uid}`).get()).data();
	eq('the stored count did not move', doc.used, 15);
	// The same limit through the UI for the bot's phone is the same code path: show the disabled box
	await db.collection('agoraMaterialChats').doc(first.id).update({ used: 14 });
	await phone.reload({ waitUntil: 'domcontentloaded' });
	await phone.locator('.materials__open').click();
	await phone.locator('.materials__left').waitFor();
	await ask(phone, 'How many steps did the keeper climb?', 'You have used all');
	eq('the box is disabled at zero', await phone.locator('.materials__input').isDisabled(), true);
	await phone.screenshot({ path: `${SHOTS}/4-student-limit.png` });

	console.log(`\nPASS  (screenshots in ${SHOTS})`);
} finally {
	await browser.close();
	web.close();
}
process.exit(0);
