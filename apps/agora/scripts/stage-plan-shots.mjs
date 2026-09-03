/* Screens of the stage plan, for eyes: the named join, the question stage
 * (answering, then weighing), the stage navigator with a step back, the
 * teacher's plan rail + answers panel + live C_p bands, the closed question's
 * banded record as the class reads it, and the start screen in quick mode.
 *
 * Run: npx tsx scripts/stage-plan-shots.mjs  →  stage-plan-shots/*.png
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { mkPage, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, teacherUrl } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement } = require('../src/lib/statementDocs');

await preflight();
const DIR = 'stage-plan-shots';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `shots-${Date.now().toString(36)}`;

const plan = stagePlanPreset('quickDecision').map((item) =>
	item.stage === AgoraStage.question
		? { ...item, title: 'מה אני רוצה?', explanation: 'משפט אחד או שניים — מה היית רוצה שיקרה בבקרים.' }
		: item,
);
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 2,
	proposals: 0,
	quiet: true,
	runId,
	quick: { title: 'בקרים בבית שלנו', mainQuestion: 'איך ווש יכולה לקום בזמן בבוקר?', explanation: 'פתרון שכולנו חיים איתו.' },
	identity: 'named',
	botNames: ['אבא', 'אמא'],
	stagePlan: plan,
});
await callable('agoraAdvanceStage', { sessionId: game.sessionId, toIndex: 1 }, game.teacherToken);
const session = (await db.collection(Collections.agoraSessions).doc(game.sessionId).get()).data();
const questionItem = session.stagePlan[1];
const ANSWERS = ['שקט בבוקר ובלי צעקות', 'שעון מעורר שאני בוחרת'];
for (const [index, bot] of game.bots.entries()) {
	const id = `${game.sessionId}--${bot.uid}--question-1`;
	await db.collection(Collections.statements).doc(id).set(
		buildAnswerStatement(session, questionItem.statementId, id, bot.uid, bot.anonName, ANSWERS[index]),
	);
}

const browser = await chromium.launch();
try {
	step('student: the named door');
	const student = await mkPage(browser, 'student', { width: 430, height: 900 });
	await student.goto(game.joinUrl, { waitUntil: 'domcontentloaded' });
	await student.waitForSelector('.join__name-input', { timeout: 30_000 });
	await shot(student, '1-join-named');
	await student.fill('.join__name-input', 'ווש');
	await student.click('button.btn--primary');
	await student.waitForSelector('.question__ask', { timeout: 30_000 });
	await shot(student, '2-question-before-answer');

	step('student: answer, then weigh the others');
	await student.fill('.question__textarea', 'ארוחת בוקר טעימה שמחכה לי');
	await student.click('.question__mine button.btn--primary');
	await student.waitForSelector('.question__answer .rate-scale', { timeout: 30_000 });
	await shot(student, '3-question-weighing');
	await student.locator('.question__answer').first().locator('.rate-scale__option--strong-for').click();
	await student.waitForTimeout(1500);
	await shot(student, '4-question-rated');

	step('student: a step back through the navigator, and back to now');
	await student.click('.stage-nav__station--done');
	await student.waitForSelector('.stage-nav__past', { timeout: 10_000 });
	await shot(student, '5-stepped-back-to-lobby');
	await student.click('.stage-nav__past button');
	await student.waitForSelector('.question__ask', { timeout: 10_000 });

	step('teacher: board with plan rail and answers');
	const teacher = await mkPage(browser, 'teacher', { width: 1280, height: 1000 });
	await teacher.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
		`${runId}-teacher`,
	);
	await teacher.waitForTimeout(1500);
	await teacher.goto(teacherUrl(game.sessionId), { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.teacher-plan', { timeout: 30_000 });
	await teacher.waitForSelector('.teacher-answers__row', { timeout: 30_000 });
	await shot(teacher, '6-teacher-question-board');
	await teacher.click('.teacher-plan button.btn--ghost');
	await teacher.waitForSelector('.plan-editor', { timeout: 10_000 });
	await shot(teacher, '7-teacher-edit-upcoming');

	step('teacher: the live C_p bands, then close the question');
	await teacher.goto(teacherUrl(game.sessionId), { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.cp-band', { timeout: 30_000 });
	await shot(teacher, '8-teacher-cp-bands-live');
	await callable('agoraAdvanceStage', { sessionId: game.sessionId, toIndex: 2 }, game.teacherToken);

	step('student: the record travels — carried context, then the closed question');
	// The advance moves the student on to the square, where the record rides
	// along in the carried-context card; the question's own outcome card is a
	// step back through the navigator.
	await student.waitForSelector('.carried .cp-band', { timeout: 30_000 });
	await shot(student, '9-record-carried-forward');
	await student.locator('.stage-nav__station--done').nth(1).click();
	await student.waitForSelector('.question__outcome .cp-band', { timeout: 30_000 });
	await shot(student, '10-question-record-banded');

	step('teacher: start screen in quick mode');
	await teacher.goto(`${VITE_HOST}/#!/teach/start`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.plan-editor', { timeout: 30_000 });
	const quickButton = teacher.locator('.teacher__mode-row button', { hasText: 'משחק מהיר' }).first();
	await quickButton.click();
	await teacher.waitForTimeout(300);
	await teacher.locator('.plan-editor__item button.btn--ghost', { hasText: 'הגדרות' }).first().click();
	await teacher.waitForTimeout(300);
	await shot(teacher, '11-start-quick');
	console.log(`\n✓ screens in ${DIR}/`);
} finally {
	await browser.close();
}
process.exit(0);
