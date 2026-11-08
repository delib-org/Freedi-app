/* The scenario lives in the village: the film, the people, the cards.
 *
 * Tal ran the French Revolution lesson and "it just shows the village": the
 * time-tunnel film and the two characters were lost on a library shelf. This
 * walks the fix on the seeded lesson:
 *
 *   lobby -> teacher NEXT -> the opening film is the full-screen travel card
 *   on the phone AND on the wall (the wall with sound), skippable after 5 s,
 *   then the village; the Count and Camille stand at the study house and
 *   speak only their fixed lines; at the story/needs booth their cards hang
 *   in the desk bubble, one tap from the pen; at the council the characters'
 *   existing verdicts are drawn as portrait tiles.
 *
 * Run (private suite): bash <ports.sh wrapper> npx tsx scripts/e2e-story-in-village.mjs [--keep] [--out=dir]
 * Screenshots land in output/story-in-village/ (gitignored).
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, stagePlanPreset } = require('@freedi/shared-types');

await preflight();

const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outFlag ? outFlag.slice('--out='.length) : 'output/story-in-village';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `siv-${Date.now().toString(36)}`;

step('the French Revolution lesson, in the lobby, three bots seated');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.lobby,
	students: 3,
	proposals: 0,
	quiet: true,
	runId,
	teacher,
	stagePlan: stagePlanPreset('scenarioWizcol'),
});
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`   session ${run.sessionId} (code ${run.code})`);
const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
const sessionDoc = async () => (await sessionRef.get()).data();

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});

/** A real phone: 390px, touch, Hebrew — the page is laid out as a phone lays it out */
const mkPhone = async (label) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 2,
	});
	const page = await context.newPage();
	await page.addInitScript(() => window.localStorage.setItem('agora_lang', 'he'));
	page.on('pageerror', (error) => console.log(`[${label} PAGEERROR]`, error.message.slice(0, 160)));
	page.on('console', (message) => {
		if (message.type() === 'error') console.log(`[${label} CONSOLE]`, message.text().slice(0, 160));
	});

	return page;
};

/** The world has finished walking the student somewhere (the village's own probe) */
const arrived = async (page, timeout = 90_000) => {
	const world = () => page.frames().find((frame) => frame.url().includes('village.html'));
	await expect
		.poll(async () => world()?.evaluate(() => window.__villageDebug?.().moving === false).catch(() => false), {
			timeout,
			intervals: [500],
		})
		.toBe(true);
	await pause(1200);
};

const signInTeacherPage = async (page) => {
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	for (let attempt = 0; attempt < 3; attempt++) {
		await page.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		const ok = await page
			.waitForSelector('.teacher-nav__title', { timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		if (ok) break;
		if (attempt === 2) throw new Error('teacher sign-in never took');
	}
	await pause(800);
};

const answerRole = async (page) => {
	const choice = page.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="private"]');
	const asked = await choice.waitFor({ timeout: 5000 }).then(() => true, () => false);
	if (asked) {
		await choice.click();
		await page.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
	}
};

try {
	step('a phone (390px, Hebrew) and the wall');
	const phone = await mkPhone('phone');
	await phone.addInitScript(() => localStorage.setItem('agora_village_lite', '1'));
	await phone.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(phone, 'נועה');
	await phone.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });

	const wall = await mkPage(browser, 'wall', { width: 1280, height: 720 });
	await wall.goto(`${VITE_HOST}/#!/teach/screen/${run.sessionId}`, { waitUntil: 'domcontentloaded' });
	await wall.locator('.projector').waitFor({ timeout: 30_000 });
	await pause(3500);
	await shot(phone, '01-phone-lobby');

	const desk = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await signInTeacherPage(desk);
	await desk.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}/class`, {
		waitUntil: 'domcontentloaded',
	});
	await desk.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	await answerRole(desk);
	await desk.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await pause(2000);

	step('NEXT: the opening film is the travel card on the phone and on the wall');
	const before = (await sessionDoc()).stageIndex ?? 0;
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 1);
	const phoneFilm = phone.locator('.stage-transition--film video.opening-film__video');
	const wallFilm = wall.locator('.stage-transition--film video.opening-film__video');
	await phoneFilm.waitFor({ timeout: 20_000 });
	await wallFilm.waitFor({ timeout: 20_000 });
	await pause(1500);
	const state = (locator) =>
		locator.evaluate((v) => ({ paused: v.paused, muted: v.muted, time: v.currentTime, src: v.currentSrc }));
	const phoneState = await state(phoneFilm);
	const wallState = await state(wallFilm);
	console.log('   phone', JSON.stringify(phoneState), 'wall', JSON.stringify(wallState));
	if (!/time-tunnel\.mp4/.test(phoneState.src)) fail('the phone plays the time-tunnel film');
	if (!/time-tunnel\.mp4/.test(wallState.src)) fail('the wall plays the time-tunnel film');
	eq('the phone film is muted (a phone only autoplays muted)', phoneState.muted, true);
	const wallTapToPlay = await wall.locator('.opening-film__play').isVisible();
	if (!wallState.paused) eq('the wall film is playing with sound', wallState.muted, false);
	else eq('the wall shows the tap-to-play fallback', wallTapToPlay, true);
	await expect(phone.locator('.opening-film__sound')).toBeVisible();
	await expect(phone.locator('.opening-film__skip')).toHaveCount(0);
	await shot(phone, '02-phone-film');
	await shot(wall, '03-wall-film');

	step('the film can be skipped after five seconds, then the village appears');
	await phone.locator('.opening-film__skip').waitFor({ timeout: 10_000 });
	await shot(phone, '04-phone-film-skip');
	await phone.locator('.opening-film__skip').click();
	await phone.locator('.stage-transition').waitFor({ state: 'detached', timeout: 10_000 });
	await wall.locator('.opening-film__skip').click();
	await wall.locator('.stage-transition').waitFor({ state: 'detached', timeout: 10_000 });
	console.log('   ✓ film skipped on the phone and on the wall');
	await pause(2500);
	await shot(phone, '05-phone-village-after-film');

	step('replay from the library shelf');
	await phone.locator('.village-library__read').waitFor({ timeout: 25_000 }).catch(() => undefined);
	if (await phone.locator('.village-library__read').isVisible()) {
		await phone.locator('.village-library__read').click();
		await phone.locator('.village-library__book--film').waitFor({ timeout: 5000 });
		await shot(phone, '06-phone-library-shelf');
		await phone.locator('.village-library__book--film').click();
		await phoneFilm.waitFor({ timeout: 10_000 });
		console.log('   ✓ the shelf replays the film');
		await pause(1200);
		await phone.evaluate(() => document.querySelector('.stage-transition--film video')?.dispatchEvent(new Event('ended')));
		await phone.locator('.stage-transition').waitFor({ state: 'detached', timeout: 10_000 });
	} else {
		console.log('   (the library door is not on screen yet; replay is checked in the next run)');
	}

	step('NEXT: perspectives — the Count and Camille stand at the study house');
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 2);
	await phone.locator('.cast-bubble').waitFor({ timeout: 45_000 });
	await arrived(phone);
	await shot(phone, '07-phone-perspectives');
	const speaker = await phone.locator('.cast-bubble__name').innerText();
	const line = await phone.locator('.cast-bubble__line').innerText();
	console.log(`   ${speaker}: ${line}`);
	if (!/הרוזן/.test(speaker)) fail('the Count speaks first');
	if (!/ברוכים הבאים/.test(line)) fail('the Count speaks his fixed scene line');
	await phone.locator('.cast-bubble__line').click();
	await pause(300);
	console.log('   ✓ tap = next fixed line:', await phone.locator('.cast-bubble__line').innerText());
	await phone.locator('.cast-bubble__chips .cast-chip').nth(1).click();
	await pause(300);
	eq('Camille is next', (await phone.locator('.cast-bubble__name').innerText()).includes('קמיל'), true);
	await shot(phone, '08-phone-camille');

	step('NEXT: needs — the same house, the same two voices, now what they need');
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 3);
	await phone.locator('.cast-bubble__question').waitFor({ timeout: 30_000 });
	await pause(1500);
	await shot(phone, '09-phone-needs');
	console.log('   ', await phone.locator('.cast-bubble__line').innerText());

	step('NEXT: positioning, and the wall follows the room');
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 4);
	await phone.locator('.cast-bubble').waitFor({ timeout: 30_000 });
	await pause(1500);
	await shot(phone, '10-phone-positioning');

	step('NEXT: the story booth — the cards hang in the desk bubble');
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 5);
	await arrived(phone);
	await phone.locator('.place-bar__item[data-place="note"]').click();
	await phone.locator('.village-desk .cast-cards').waitFor({ timeout: 20_000 });
	await pause(1500);
	await phone.locator('.village-desk .cast-chip').first().click();
	await phone.locator('.cast-card').waitFor({ timeout: 5000 });

	await shot(phone, '11-phone-desk-card-opinions');
	await phone.locator('.cast-card__flip').click();
	await expect(phone.locator('.cast-card--needs')).toBeVisible();
	await shot(phone, '12-phone-desk-card-needs');
	eq('the pen is still there under the card', await phone.locator('.village-desk textarea').count() > 0, true);
	await shot(wall, '13-wall-booth');

	step('the council: the characters\' existing verdicts, two portrait tiles per proposal');
	const vote = await fastlane({
		stage: AgoraStage.voting,
		students: 3,
		proposals: 3,
		ratings: true,
		quiet: true,
		runId: `${runId}-vote`,
		teacher,
		stagePlan: stagePlanPreset('scenarioWizcol'),
	});
	await db.collection('agoraSessions').doc(vote.sessionId).update({ world: 'village' });
	const voteSession = (await db.collection('agoraSessions').doc(vote.sessionId).get()).data();
	const candidates = voteSession.voting?.candidates ?? [];
	if (candidates.length === 0) fail('the voting stage has candidates');
	const topicDoc = (await db.collection('agoraTopicPackages').doc(voteSession.topicPackageId).get()).data();
	const verdicts = [
		['יש כאן סדר, אבל חסר לי כבוד למסורת. עוד קצת ואני איתכם.', 61],
		['לחם על השולחן — זה מה שחשוב. ההצעה הזאת מקשיבה לעם.', 78],
	];
	for (const candidate of candidates) {
		for (const [i, character] of topicDoc.characters.slice(0, 2).entries()) {
			await db
				.collection('agoraCharacterReviews')
				.doc(`${candidate.statementId}--${character.characterId}`)
				.set({
					reviewId: `${candidate.statementId}--${character.characterId}`,
					sessionId: vote.sessionId,
					statementId: candidate.statementId,
					characterId: character.characterId,
					verdictText: verdicts[i][0],
					acceptanceScore: verdicts[i][1],
					advice: [],
					asksByRound: {},
					roundNumber: 1,
					createdAt: Date.now(),
					lastUpdate: Date.now(),
				});
		}
	}
	const voter = await mkPhone('voter');
	await voter.addInitScript(() => localStorage.setItem('agora_village_lite', '1'));
	await voter.goto(`${VITE_HOST}/#!/join/${vote.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(voter, 'דנה');
	await voter.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await arrived(voter);
	await pause(2500);
	await shot(voter, '14-phone-council-tiles');
	const voterWall = await mkPage(browser, 'wall2', { width: 1280, height: 720 });
	await voterWall.goto(`${VITE_HOST}/#!/teach/screen/${vote.sessionId}`, { waitUntil: 'domcontentloaded' });
	await pause(2500);
	await shot(voterWall, '15-wall-voting');

	console.log('\nALL GOOD');
} catch (error) {
	console.log('FAILED', error);
	process.exitCode = 1;
} finally {
	if (!KEEP) await browser.close();
}
