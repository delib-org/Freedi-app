/* The reword box, for eyes: closed, open, the scope question, and the room after. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { mkPage, passNameDoor, shotter, step, eq } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher, teacherUrl } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');

await preflight();
const DIR = '/tmp/claude-501/-Users-talyaron-Documents-Freedi-app/abf26b3f-3448-4d6d-ade2-1694af99aac5/scratchpad/reword-shots';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `reword-${Date.now().toString(36)}`;

step('a game sitting on the needs round');
const teacher = await signInTeacher(`${runId}-teacher`);
await db.collection('usersV2').doc(teacher.uid).set({ email: `${runId}-teacher@example.com`, displayName: 'דנה המורה' }, { merge: true });
const plan = stagePlanPreset('wizcol');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 3,
	proposals: 0,
	quiet: true,
	teacher,
	quick: { title: 'הפסקות בבית הספר', mainQuestion: 'איך ההפסקות אצלנו ייראו?' },
	stagePlan: plan,
});
const needsIndex = plan.findIndex((item) => item.itemId === 'round-needs');
await callable('agoraAdvanceStage', { sessionId: game.sessionId, toIndex: needsIndex }, game.teacherToken);

const browser = await chromium.launch();
try {
	const page = await mkPage(browser, 'teacher', { width: 1180, height: 1000 });
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await page.evaluate((sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }), `${runId}-teacher`);
	await page.waitForTimeout(1200);

	step('the console, on the needs round');
	await page.goto(teacherUrl(game.sessionId), { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-instructions', { timeout: 30_000 });
	await page.waitForTimeout(1200);
	const shown = await page.textContent('.teacher-instructions__scene-title');
	console.log(`   the room reads: ${shown}`);
	await page.locator('.teacher-instructions').scrollIntoViewIfNeeded();
	await shot(page, '1-pencil');

	step('the teacher opens the box');
	await page.click('.question-reword__open');
	await page.waitForSelector('.question-reword__text', { timeout: 10_000 });
	const prefilled = await page.inputValue('.question-reword__text');
	eq('the box opens on the words the room is reading', prefilled, shown.trim());
	await page.waitForTimeout(400);
	await shot(page, '2-open');

	step('the teacher types clearer words');
	await page.fill('.question-reword__text', 'מה חשוב לך שיקרה בהפסקה?');
	await page.fill('.question-reword__textarea', 'לא פתרון ולא הצעה — מה חשוב לך.');
	await page.waitForTimeout(300);
	await shot(page, '3-typed');

	step('save asks: here, or in every needs round?');
	await page.click('.question-reword__actions .btn--primary');
	await page.waitForSelector('.question-reword__scope', { timeout: 10_000 });
	await page.waitForTimeout(400);
	await shot(page, '4-scope-question');
	console.log(`   asked: ${await page.textContent('.question-reword__scope-title')}`);

	step('“in every needs round of mine”');
	await page.click('.question-reword__scope .btn--primary');
	await page.waitForSelector('.question-reword__done', { timeout: 20_000 });
	await page.waitForTimeout(800);
	await shot(page, '5-saved');
	const after = (await page.textContent('.teacher-instructions__scene-title')).trim();
	eq('the card shows the new question', after, 'מה חשוב לך שיקרה בהפסקה?');
	console.log(`   confirmation: ${await page.textContent('.question-reword__done')}`);

	step('and the class sees it: the student screen');
	const student = await mkPage(browser, 'student', { width: 430, height: 900 });
	await student.goto(game.joinUrl, { waitUntil: 'domcontentloaded' });
	await passNameDoor(student, 'רותם');
	await student.waitForSelector('.round__title', { timeout: 30_000 });
	await student.waitForTimeout(1000);
	await shot(student, '6-student');
	console.log(`   the phone reads: ${await student.textContent('.round__title')}`);

	const prompts = (await db.collection(Collections.agoraTeacherPrompts).doc(teacher.uid).get()).data();
	eq('filed as the teacher’s own wording', prompts.prompts.needs.title, 'מה חשוב לך שיקרה בהפסקה?');
} finally {
	await browser.close();
}
console.log(`\n✓ shots in ${DIR}`);
process.exit(0);
