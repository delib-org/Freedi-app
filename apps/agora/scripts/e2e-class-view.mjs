/* The teacher's class view: the room as the students see it, with no seat.
 *
 * A WizCol lesson at its first question, four named bots on the board. The
 * teacher opens the console's class view on a laptop and on a phone, and
 * the script asserts the things a screenshot cannot: that no participant doc
 * appeared for the teacher, that the note door is the one locked door, that
 * there is exactly one NEXT and it moves the room, that flipping Board ⇄ Class
 * keeps the console's listeners (the Class panel still lists the names), and
 * that the phone's director row rides inside the place bar's wrap.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/e2e-class-view.mjs [--keep] [--out=dir]
 * Screenshots land in output/class-view/.
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, stagePlanPreset, createAgoraParticipantId } = require('@freedi/shared-types');
const { answerStatementId, buildAnswerStatement } = require('../src/lib/statementDocs');

await preflight();

const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outFlag ? outFlag.slice('--out='.length) : 'output/class-view';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `cv-${Date.now().toString(36)}`;
const REAL_NAMES = ['נועה לוי', 'איתן כהן', 'מאיה פרץ', 'יונתן ברק'];

step('a WizCol lesson at its first question, in the village, with real names');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.question,
	students: 4,
	proposals: 3,
	quiet: true,
	runId,
	teacher,
	quick: { title: 'טיול שנתי', mainQuestion: 'לאן ניסע בטיול השנתי?', language: 'he' },
	stagePlan: stagePlanPreset('wizcol'),
	realNames: REAL_NAMES,
});
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`   session ${run.sessionId} (code ${run.code})`);

// Fastlane seeds deliberation proposals; the story station needs stories —
// written exactly as the student client writes them (same builder, same ids)
const session0 = (await db.collection('agoraSessions').doc(run.sessionId).get()).data();
const story = session0.stagePlan.find((item) => item.itemId === 'round-story');
const STORIES = [
	'בטיול הקודם ישנו באוהלים ליד הכנרת וזה היה הכי כיף.',
	'אני זוכר שנסענו לאילת ואבא שלי לימד אותי לצלול.',
	'בחופש הגדול היינו בגליל וטיפסנו על הר מירון.',
];
await Promise.all(
	run.bots.slice(0, 3).map((bot, index) =>
		db
			.collection('statements')
			.doc(answerStatementId(run.sessionId, bot.uid, story.itemId))
			.set(
				buildAnswerStatement(
					session0,
					story.statementId,
					answerStatementId(run.sessionId, bot.uid, story.itemId),
					bot.uid,
					bot.anonName,
					STORIES[index],
				),
				{ merge: true },
			),
	),
);
console.log('   ✓ three stories on the board');

const sessionDoc = async () => (await db.collection('agoraSessions').doc(run.sessionId).get()).data();
const participantCount = async () =>
	(await db.collection('agoraParticipants').where('sessionId', '==', run.sessionId).get()).size;
const seats = await participantCount();

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});

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

const classRoute = `${VITE_HOST}/#!/teach/session/${run.sessionId}/class`;
const boardRoute = `${VITE_HOST}/#!/teach/session/${run.sessionId}`;
const openClassView = async (page) => {
	await page.goto(classRoute, { waitUntil: 'domcontentloaded' });
	await page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	// Let the world load and the walker arrive at the station
	await pause(4000);
};

try {
	step('desktop: the class view opens in the village under the bar and the strip');
	const page = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) console.log(`   → ${new Date().toISOString().slice(11, 19)} ${frame.url()}`);
	});
	await signIn(page);
	await openClassView(page);
	await shot(page, 'desktop-class');
	await expect(page.locator('.teacher-nav__view-btn[data-view="class"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	eq('one NEXT on the screen', await page.locator('#teacher-next').count(), 1);
	eq('the strip stays under the bar on a laptop', await page.locator('.teacher-strip--director').count(), 0);
	await expect(page.locator('.place-bar__item[data-place="note"]')).toHaveClass(/place-bar__item--locked/);
	await expect(page.locator('.place-bar__item[data-place="board"]')).not.toHaveClass(/--locked/);
	await expect(page.locator('.place-bar__item[data-place="results"]')).not.toHaveClass(/--locked/);
	eq('no purse for a watcher', await page.locator('.village-coins').count(), 0);

	step('the note door says who writes here; the board reads the class');
	// A locked door is aria-disabled (kept in the tab order to say why); Playwright
	// will not click it, so the press is dispatched
	await page.locator('.place-bar__item[data-place="note"]').dispatchEvent('click');
	await expect(page.locator('.place-bar__hint')).toContainText('כאן התלמידים כותבים');
	await page.locator('.place-bar__item[data-place="board"]').click();
	await page.locator('.village-board').waitFor({ timeout: 10_000 });
	await pause(600);
	await shot(page, 'desktop-board-panel');
	eq('no rating widget for a watcher', await page.locator('.village-note__rate').count(), 0);
	eq('no door into a conversation', await page.locator('.village-note__open').count(), 0);
	const authors = await page.locator('.village-note__author').count();
	if (authors === 0) fail('the private device shows no author chips on classmates\' notes');
	await expect(page.locator('.village-note__author').first()).toContainText(/לוי|כהן|פרץ|ברק/);

	step('nothing wrote: the roster is unchanged and the teacher has no seat');
	eq('participant count', await participantCount(), seats);
	const seat = await db
		.collection('agoraParticipants')
		.doc(createAgoraParticipantId(run.sessionId, teacher.uid))
		.get();
	eq('teacher participant doc exists', seat.exists, false);

	step('Board ⇄ Class keeps the console: the Class panel still lists the names');
	await page.locator('.teacher-nav__view-btn[data-view="board"]').click();
	await page.locator('.teacher-now').waitFor({ timeout: 15_000 });
	await pause(500);
	eq('village gone on the board', await page.locator('iframe.village-shell__world').count(), 0);
	await page.locator('.teacher-panels__chip[aria-controls="teacher-panel-class"]').click();
	await expect(page.locator('#teacher-panel-class')).toContainText(REAL_NAMES[0]);
	await page.locator('.teacher-panel__close').click();
	await page.locator('.teacher-nav__view-btn[data-view="class"]').click();
	await page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	eq('the flip remembers the choice', await page.evaluate(() => localStorage.getItem('agora.teacher.view')), 'class');
	await pause(3000);

	step('NEXT from the class view moves the room');
	const before = (await sessionDoc()).stageIndex ?? 0;
	await page.locator('#teacher-next').click();
	await expect
		.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 })
		.toBe(before + 1);
	await pause(3000);
	await shot(page, 'desktop-after-next');
	eq('the watcher followed the class', await page.locator('.stage-nav__past').count(), 0);

	step('the bare route reopens in the remembered view');
	await page.goto(boardRoute, { waitUntil: 'domcontentloaded' });
	await page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await pause(500);
	// replaceState is a same-document move; ask the document, not Playwright's cache
	eq('route after redirect', await page.evaluate(() => location.hash.endsWith('/class')), true);
	await page.close();

	step('phone: the strip is the director row inside the place bar');
	const phone = await mkPage(browser, 'phone', { width: 390, height: 740 });
	await signIn(phone);
	await openClassView(phone);
	await shot(phone, 'phone-class');
	eq('one NEXT on the phone', await phone.locator('#teacher-next').count(), 1);
	eq('the row rides in the bar', await phone.locator('.place-bar__lead .teacher-strip--director #teacher-next').count(), 1);
	eq('no fixed strip', await phone.locator('.teacher-console > .teacher-strip').count(), 0);
	const lead = await phone.locator('.place-bar__lead').boundingBox();
	const bar = await phone.locator('nav.place-bar').boundingBox();
	if (!lead || !bar || lead.y + lead.height > bar.y + 1) fail('the director row is not above the doors');
	// The view switch stays on the bar at phone width
	await expect(phone.locator('.teacher-nav__view-btn[data-view="board"]')).toBeVisible();
	await phone.close();

	step('320px: still one row, labels folded to icons');
	const narrow = await mkPage(browser, 'narrow', { width: 320, height: 568 });
	await signIn(narrow);
	await openClassView(narrow);
	await shot(narrow, 'narrow-class');
	eq('one NEXT at 320', await narrow.locator('#teacher-next').count(), 1);
	await expect(narrow.locator('.teacher-nav__view-label').first()).toBeHidden();
	await narrow.close();

	console.log('\n✓ class view: all assertions passed');
} finally {
	if (!KEEP) await browser.close();
}
