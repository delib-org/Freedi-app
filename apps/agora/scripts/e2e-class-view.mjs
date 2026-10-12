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
import { eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
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
/** A laptop is asked once where it is; these walks answer "just me" unless told otherwise */
const answerRole = async (page, role = 'private') => {
	const choice = page.locator(`.device-role[data-mode="ask"] .device-role__choice[data-role="${role}"]`);
	const asked = await choice.waitFor({ timeout: 5000 }).then(() => true, () => false);
	if (asked) {
		await choice.click();
		await page.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
	}
};
const openClassView = async (page, role = 'private') => {
	await page.goto(classRoute, { waitUntil: 'domcontentloaded' });
	await page.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	await answerRole(page, role);
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

	step('a student in the village, at the station the class is on');
	const student = await mkPage(browser, 'student', { width: 1360, height: 860 });
	await student.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(student, 'דנה');
	await student.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await pause(4000);

	step('move the class: the sheet, and a gather at a past station');
	const desk = await mkPage(browser, 'desk', { width: 1280, height: 900 });
	await signIn(desk);
	await openClassView(desk);
	await desk.locator('.teacher-strip__pennant').click();
	await desk.locator('#teacher-move').waitFor({ timeout: 10_000 });
	await pause(400);
	await shot(desk, 'desktop-move-sheet');
	const rows = await desk.locator('.move-class__row').evaluateAll((els) =>
		els.map((el) => `${el.dataset.move}:${el.dataset.item}`),
	);
	console.log(`   rows: ${rows.join(' · ')}`);
	eq('the first row gathers at the first station', rows[0], 'gather:round-story');
	if (!rows.some((row) => row.startsWith('next:'))) fail('no "opens next" row');
	if (!rows.some((row) => row.startsWith('jump:'))) fail('no jump row');
	await desk.locator('.move-class__row[data-move="gather"][data-item="round-story"]').click();
	await expect
		.poll(async () => (await sessionDoc()).villageCall?.place, { timeout: 15_000 })
		.toBe('booth:round-story');
	await expect(desk.locator('#teacher-move .lobby__status')).toContainText('נקראו');
	await desk.locator('.teacher-panel__close').click();

	step('the student walks there: the line, the post box, the station');
	// The call moves the student at once (the card over the screen, the item
	// selected, the whereabouts reported) and the world walks the picture of it
	const world = student.frameLocator('iframe.village-shell__world');
	await expect(world.locator('#news-text')).toContainText('המורה קורא לכולם אל', { timeout: 15_000 });
	await expect(student.locator('.stage-nav__past')).toBeVisible({ timeout: 40_000 });
	await shot(student, 'student-called');
	eq(
		'the call is in the post box',
		await student.evaluate((id) =>
			(JSON.parse(sessionStorage.getItem(`agora_${id}_inbox`) ?? '[]')).some(
				(item) => item.trigger === 'agora_called_to' && item.target?.kind === 'place',
			),
			run.sessionId,
		),
		true,
	);

	step('a private device shows names on the now card');
	await desk.locator('.teacher-nav__view-btn[data-view="board"]').click();
	await desk.locator('.teacher-now').waitFor({ timeout: 15_000 });
	await expect(desk.locator('.teacher-nav__role--private')).toBeVisible();
	await expect(desk.locator('.teacher-now__chip').first()).toContainText(/לוי|כהן|פרץ|ברק/, {
		timeout: 15_000,
	});
	eq(
		'the private device holds the names',
		await desk.evaluate(() => window.__agoraDebug?.()?.teacherConsole?.identitiesSubscribed),
		true,
	);
	await shot(desk, 'desktop-board-names');
	await desk.locator('.teacher-nav__view-btn[data-view="class"]').click();
	await desk.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await pause(3000);

	step('open a station ahead: the confirm names what closes and what is skipped');
	await desk.locator('.teacher-strip__pennant').click();
	await desk.locator('#teacher-move').waitFor({ timeout: 10_000 });
	const jump = desk.locator('.move-class__row[data-move="jump"]').first();
	const jumpItem = await jump.getAttribute('data-item');
	eq('the first jump skips the deliberation', jumpItem, 'voting');
	await jump.click();
	await desk.locator('.move-class__confirm').waitFor({ timeout: 5000 });
	await expect(desk.locator('.move-class__consequences')).toContainText('מדלג');
	await shot(desk, 'desktop-move-confirm');
	const idx1 = (await sessionDoc()).stageIndex ?? 0;
	await desk.locator('.move-class__ok').click();
	await expect
		.poll(async () => (await sessionDoc()).stage, { timeout: 30_000 })
		.toBe('voting');
	eq('the room jumped past the deliberation', ((await sessionDoc()).stageIndex ?? 0) - idx1, 2);
	await pause(3000);

	step('two devices: the other hand presses first — a quiet line, not an error');
	const deskB = await mkPage(browser, 'deskB', { width: 1280, height: 900 });
	await signIn(deskB);
	await openClassView(deskB);
	const idx0 = (await sessionDoc()).stageIndex ?? 0;
	await deskB.locator('#teacher-next').click();
	await expect
		.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 })
		.toBe(idx0 + 1);
	await expect(desk.locator('.teacher-strip__status')).toContainText('המכשיר השני', { timeout: 15_000 });
	eq('no failure banner on the quiet device', await desk.locator('.teacher-strip__fail').count(), 0);
	await shot(desk, 'desktop-moved-elsewhere');
	await deskB.locator('.teacher-strip__pennant').click();
	await deskB.locator('.move-class__council').click();
	await expect(desk.locator('.teacher-strip__status')).toContainText('נקראה', { timeout: 15_000 });
	await deskB.close();
	await desk.close();

	step('a wall never holds the names, and NEXT takes two taps');
	const wall = await mkPage(browser, 'wall', { width: 1280, height: 900 });
	await wall.addInitScript(() => localStorage.setItem('agora.teacher.device', 'wall'));
	await signIn(wall);
	await wall.goto(boardRoute, { waitUntil: 'domcontentloaded' });
	await wall.locator('.teacher-nav__role--wall').waitFor({ timeout: 30_000 });
	await pause(1500);
	await shot(wall, 'desktop-wall');
	eq(
		'the wall never subscribed to the names',
		await wall.evaluate(() => window.__agoraDebug?.()?.teacherConsole?.identitiesSubscribed),
		false,
	);
	for (const name of REAL_NAMES) {
		if ((await wall.locator('body').innerText()).includes(name)) fail(`a real name is on the wall: ${name}`);
	}
	await wall.locator('.teacher-panels__chip[aria-controls="teacher-panel-class"]').click();
	await expect(wall.locator('#teacher-panel-class')).toContainText('מוסתר');
	for (const name of REAL_NAMES) {
		if ((await wall.locator('body').innerText()).includes(name)) fail(`a real name is on the wall: ${name}`);
	}
	await wall.locator('.teacher-panel__close').click();
	const idx2 = (await sessionDoc()).stageIndex ?? 0;
	await wall.locator('#teacher-next').click();
	await expect(wall.locator('#teacher-next')).toContainText('הקישו שוב');
	await pause(1200);
	eq('one tap moves nothing on a wall', (await sessionDoc()).stageIndex ?? 0, idx2);
	await wall.locator('#teacher-next').click();
	await expect
		.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 })
		.toBe(idx2 + 1);
	await wall.close();
	await student.close();

	console.log('\n✓ class view: all assertions passed');
} finally {
	if (!KEEP) await browser.close();
}
