/* The teacher sees a refused text the moment it is refused.
 *
 * A lesson with three named bots; the teacher's console open on a laptop
 * that answered "just me". A bot writes an insult and the REAL language gate
 * (agoraCheckLanguage, the live model) refuses it. The script asserts:
 *
 *   - Firestore: the strike on the participant, the `language` line on the
 *     private thread with the words and the place, and that a classmate's
 *     token cannot list that line;
 *   - the teacher's board: an alert naming the student (real name), quoting
 *     the words and saying where they were written — without a tap;
 *   - the strike chip on the student's row in the Class panel, and the line
 *     with its place in the student's thread;
 *   - the class view carries the same alert; "got it" clears it and a reload
 *     keeps it cleared;
 *   - a wall says only that a text was refused: no name, no words.
 *
 * Run (solo suite only — e2e wipes nothing here, but never aim it at prod):
 *   bash ../../scripts/solo.sh npx tsx scripts/e2e-language-alert.mjs [--keep] [--out=dir]
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { preflight, FIRESTORE_REST, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions'] });

const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outFlag ? outFlag.slice('--out='.length) : 'output/language-alert';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `lang-${Date.now().toString(36)}`;
const REAL_NAMES = ['נועה לוי', 'איתן כהן', 'מאיה פרץ'];
const INSULT = 'You are all stupid idiots, shut up';

step('a lesson in deliberation with three named bots');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: 'deliberation',
	students: 3,
	proposals: 2,
	quiet: true,
	runId,
	teacher,
	realNames: REAL_NAMES,
});
const { sessionId, bots } = run;
const [alice, bob] = bots;
console.log(`   session ${sessionId}`);

const browser = await chromium.launch({ headless: !KEEP });

const signIn = async (page) => {
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
	for (let attempt = 0; attempt < 3; attempt++) {
		await page.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		const signedIn = await page
			.waitForSelector('.teacher-nav__title', { timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		if (signedIn) break;
		if (attempt === 2) throw new Error('teacher sign-in never took');
	}
	await pause(800);
};

const boardRoute = `${VITE_HOST}/#!/teach/session/${sessionId}`;
const classRoute = `${boardRoute}/class`;

try {
	step('the teacher opens the board on a laptop that is "just me"');
	const page = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await page.addInitScript(() => localStorage.setItem('agora.teacher.device', 'private'));
	await signIn(page);
	await page.goto(boardRoute, { waitUntil: 'domcontentloaded' });
	await page.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	await pause(1500);
	eq('no alert before anything is refused', await page.locator('.language-alert').count(), 0);

	step('a bot writes an insult; the live gate refuses it');
	const before = Date.now();
	const verdict = await callable(
		'agoraCheckLanguage',
		{ sessionId, text: INSULT, place: 'note' },
		alice.idToken,
	);
	eq('the gate refused the text', verdict.ok, false);
	eq('first strike', verdict.strikes, 1);

	const participant = (
		await db.collection('agoraParticipants').doc(`${sessionId}--${alice.uid}`).get()
	).data();
	eq('strike on the participant', participant.languageStrikes, 1);
	const lines = await db
		.collection('agoraTeacherMessages')
		.where('sessionId', '==', sessionId)
		.where('studentUid', '==', alice.uid)
		.get();
	const line = lines.docs.map((snap) => snap.data()).find((entry) => entry.kind === 'language');
	if (!line) fail('no language line on the thread');
	eq('line from', line.from, 'system');
	eq('line keeps the words', line.removedText, INSULT);
	eq('line keeps the place', line.languagePlace, 'note');

	const restList = async (token, filters) => {
		const response = await fetch(
			`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					structuredQuery: {
						from: [{ collectionId: 'agoraTeacherMessages' }],
						where: {
							compositeFilter: {
								op: 'AND',
								filters: filters.map(([field, value]) => ({
									fieldFilter: {
										field: { fieldPath: field },
										op: 'EQUAL',
										value: { stringValue: value },
									},
								})),
							},
						},
					},
				}),
			},
		);

		return response.status;
	};
	eq(
		"a classmate cannot list the student's thread",
		await restList(bob.idToken, [
			['sessionId', sessionId],
			['studentUid', alice.uid],
		]),
		403,
	);

	step('the board shows the alert — name, words, place — with no tap');
	const alert = page.locator('[data-testid="language-alert"]');
	await alert.waitFor({ timeout: 15_000 });
	console.log(`   ✓ alert visible ${Date.now() - before}ms after the refusal was sent`);
	await expect(alert).toContainText(REAL_NAMES[0]);
	await expect(alert).toContainText(INSULT);
	await expect(alert).toContainText('בפתק');
	await expect(alert.locator('.language-alert__strikes')).toContainText('1');
	await shot(page, 'board-alert');

	step("the strike sits on the student's row; the thread holds the line");
	await page.locator('.language-alert__open').first().click();
	const drawer = page.locator('.teacher-drawer');
	await drawer.waitFor({ timeout: 5000 });
	await expect(drawer.locator('.teacher-thread__removed')).toContainText(INSULT);
	await expect(drawer).toContainText('בפתק');
	await shot(page, 'drawer');
	await page.keyboard.press('Escape');
	await drawer.waitFor({ state: 'detached', timeout: 5000 });
	await page
		.locator('[aria-controls="teacher-panel-class"]')
		.first()
		.click()
		.catch(async () => {
			await page
				.locator('button', { hasText: /כיתה|Class/ })
				.first()
				.click();
		});
	const chip = page.locator('.class-panel__strikes--chip');
	await chip.first().waitFor({ timeout: 5000 });
	await expect(chip.first()).toContainText('1');
	await shot(page, 'class-panel-chip');

	step('the class view carries the same alert; "got it" clears it for good');
	await page.goto(classRoute, { waitUntil: 'domcontentloaded' });
	await alert.waitFor({ timeout: 30_000 });
	await expect(alert).toContainText(INSULT);
	await shot(page, 'class-view-alert');
	await alert.locator('.btn--primary').click();
	await alert.waitFor({ state: 'detached', timeout: 5000 });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	await pause(2500);
	eq('dismissed alert stays dismissed after a reload', await alert.count(), 0);

	step('a second refusal raises it again; a wall says only that it happened');
	const wall = await mkPage(browser, 'wall', { width: 1280, height: 800 });
	await wall.addInitScript(() => localStorage.setItem('agora.teacher.device', 'wall'));
	await signIn(wall);
	await wall.goto(boardRoute, { waitUntil: 'domcontentloaded' });
	await wall.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	const second = await callable(
		'agoraCheckLanguage',
		{ sessionId, text: 'shut up you moron', place: 'chat' },
		alice.idToken,
	);
	eq('second refusal', second.ok, false);
	eq('second strike', second.strikes, 2);
	await alert.waitFor({ timeout: 15_000 });
	await expect(alert).toContainText('shut up you moron');
	await expect(alert.locator('.language-alert__strikes')).toContainText('2');
	const wallAlert = wall.locator('.language-alert--wall');
	await wallAlert.waitFor({ timeout: 15_000 });
	const wallText = await wallAlert.innerText();
	if (
		wallText.includes(REAL_NAMES[0]) ||
		wallText.includes('moron') ||
		wallText.includes(alice.anonName)
	) {
		fail('the wall shows who or what');
	}
	console.log('   ✓ the wall names nobody and quotes nothing');
	await shot(wall, 'wall-alert');

	step('the alert never covers NEXT — on the laptop or on a phone');
	const clearOfNext = async (target, label) => {
		const next = target.locator('#teacher-next');
		if ((await next.count()) === 0) return;
		const a = await target.locator('.language-alert').boundingBox();
		const b = await next.first().boundingBox();
		if (!a || !b) return;
		const overlaps =
			a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
		eq(`${label}: alert clear of NEXT`, overlaps, false);
	};
	await clearOfNext(page, 'laptop');
	const phone = await mkPage(browser, 'phone', { width: 390, height: 844 });
	await phone.addInitScript(() => localStorage.setItem('agora.teacher.device', 'private'));
	await signIn(phone);
	await phone.goto(boardRoute, { waitUntil: 'domcontentloaded' });
	await phone.locator('[data-testid="language-alert"]').waitFor({ timeout: 30_000 });
	await pause(500);
	await clearOfNext(phone, 'phone');
	await shot(phone, 'phone-alert');

	console.log('\nALL LANGUAGE-ALERT CHECKS PASSED');
} finally {
	if (!KEEP) await browser.close();
}
