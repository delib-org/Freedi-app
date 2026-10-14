/* Starting, switching and stopping the class's library video from the
 * teacher's move-class sheet and strip — phones, wall and a late joiner.
 *
 *   start (sheet) → the strip shows the now-playing chip, a phone plays it,
 *   the wall goes full-bleed → switch (chip) reopens the sheet on the videos
 *   and another start replaces it everywhere → stop clears the field, the
 *   phone falls back to its poster, the wall returns to the stage → a STALE
 *   stamp never auto-plays on a phone or the wall that opens late.
 *
 * Run: npm run solo -- env AGORA_VITE_HOST=http://localhost:<your vite> \
 *        npx tsx apps/agora/scripts/e2e-library-video-sheet.mjs
 */
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';
import { createRequire } from 'node:module';

const { AgoraStage } = createRequire(import.meta.url)('@freedi/shared-types');

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });
const runId = `libsheet-${Date.now().toString(36)}`;
const VIDEOS = [
	{ videoId: 'dQw4w9WgXcQ' },
	{ videoId: 'jNQXAC9IVRw', startSeconds: 3 },
	{ videoId: 'aqz-KE-bpKQ' },
];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

step('a lesson at perspectives; the first perspective holds three YouTube videos');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.perspectives,
	students: 2,
	proposals: 0,
	quiet: true,
	runId,
	teacher,
});
const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
const session = (await sessionRef.get()).data();
const topicRef = db.collection('agoraTopicPackages').doc(session.topicPackageId);
const scenes = (await topicRef.get()).data().scenes;
const sceneA = scenes.find((scene) => scene.kind === 'perspectiveA');
await topicRef.update({
	scenes: scenes.map((scene) =>
		scene.sceneId === sceneA.sceneId ? { ...scene, youtubeVideos: VIDEOS } : scene,
	),
});

const sessionDoc = async () => (await sessionRef.get()).data();
async function until(label, probe, timeoutMs = 20_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: not observed within ${timeoutMs}ms`);
		await pause(300);
	}
}

const browser = await chromium.launch();
try {
	const openStudent = async () => {
		const page = await (
			await browser.newContext({ viewport: { width: 390, height: 844 } })
		).newPage();
		await page.addInitScript(() => localStorage.setItem('agora_lang', 'he'));
		await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
		await passNameDoor(page).catch(() => {});
		await page.waitForSelector('.scene__title', { timeout: 30_000 });
		await page.waitForSelector('.youtube', { timeout: 10_000 });

		return page;
	};
	const student = await openStudent();
	const playing = (page) =>
		page.locator('iframe.youtube__iframe').getAttribute('src', { timeout: 15_000 });

	const wall = await (
		await browser.newContext({ viewport: { width: 1280, height: 720 } })
	).newPage();
	await wall.goto(`${VITE_HOST}/#!/teach/screen/${run.sessionId}`, {
		waitUntil: 'domcontentloaded',
	});
	await wall.waitForSelector('.projector', { timeout: 20_000 });
	eq(
		'the wall shows the stage, no video yet',
		await wall.locator('iframe.projector__video').count(),
		0,
	);

	const desk = await (
		await browser.newContext({ viewport: { width: 1280, height: 900 } })
	).newPage();
	await desk.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
	for (let attempt = 0; attempt < 3; attempt++) {
		await desk.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		if (
			await desk.waitForSelector('.teacher-nav__title', { timeout: 15_000 }).then(
				() => true,
				() => false,
			)
		)
			break;
		if (attempt === 2) fail('teacher sign-in never took');
	}
	await desk.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}`, {
		waitUntil: 'domcontentloaded',
	});
	const role = desk.locator(
		'.device-role[data-mode="ask"] .device-role__choice[data-role="private"]',
	);
	if (
		await role.waitFor({ timeout: 6000 }).then(
			() => true,
			() => false,
		)
	)
		await role.click();

	step('start the first video from the move-class sheet');
	await desk.locator('.teacher-strip__pennant').click();
	await desk.locator('#teacher-move').waitFor({ timeout: 10_000 });
	const rows = desk.locator('#move-videos .library-videos__row');
	eq('three videos listed under the stations', await rows.count(), 3);
	await rows.nth(0).locator('button').click();
	await desk.locator('#teacher-move').waitFor({ state: 'detached', timeout: 10_000 });
	const started = await until('libraryVideo', async () => (await sessionDoc()).libraryVideo);
	eq('first video', started.videoId, VIDEOS[0].videoId);
	eq('one stamp with the call to the library', (await sessionDoc()).villageCall.at, started.at);
	eq('the stage did not move', (await sessionDoc()).stage, AgoraStage.perspectives);
	await desk.locator('.teacher-strip__video').waitFor({ timeout: 10_000 });
	console.log('   chip:', (await desk.locator('.teacher-strip__video-title').innerText()).trim());
	if (!(await playing(student)).includes(VIDEOS[0].videoId))
		fail('the phone is not on the first video');
	await student.locator('.youtube__hint').waitFor({ timeout: 5000 });
	console.log('   ✓ phone plays it muted with the "tap for sound" hint');
	await wall.waitForSelector('iframe.projector__video', { timeout: 15_000 });
	console.log('   ✓ the wall shows the video full-bleed');

	step('switch from the chip: the sheet opens on the videos; start the third');
	await desk.locator('.teacher-strip__video-switch').click();
	await desk.locator('#teacher-move').waitFor({ timeout: 10_000 });
	eq(
		'the playing row says so',
		await desk.locator('#move-videos .library-videos__row--now').count(),
		1,
	);
	await desk.locator('#move-videos .library-videos__row').nth(2).locator('button').click();
	await until(
		'switched',
		async () => (await sessionDoc()).libraryVideo?.videoId === VIDEOS[2].videoId,
	);
	await until('phone switched', async () => (await playing(student)).includes(VIDEOS[2].videoId));
	await until('wall switched', async () =>
		(await wall.getAttribute('iframe.projector__video', 'src')).includes(VIDEOS[2].videoId),
	);
	console.log('   ✓ phone and wall follow the switch');

	step('stop: the field clears, the phone falls back to its poster, the wall returns to the stage');
	await desk.locator('.teacher-strip__video-stop').click();
	await until('cleared', async () => (await sessionDoc()).libraryVideo === undefined);
	eq('the stage did not move', (await sessionDoc()).stage, AgoraStage.perspectives);
	await desk.locator('.teacher-strip__video').waitFor({ state: 'detached', timeout: 10_000 });
	await student.locator('iframe.youtube__iframe').waitFor({ state: 'detached', timeout: 10_000 });
	await wall.locator('iframe.projector__video').waitFor({ state: 'detached', timeout: 10_000 });
	console.log('   ✓ chip gone, phone on its poster, wall back on the stage');

	step('a stale stamp never auto-plays on a late phone or wall');
	await sessionRef.update({
		libraryVideo: {
			sceneId: sceneA.sceneId,
			videoId: VIDEOS[1].videoId,
			at: Date.now() - 60 * 60 * 1000,
		},
	});
	const late = await openStudent();
	await pause(1500);
	eq(
		'the late phone has no player running',
		await late.locator('iframe.youtube__iframe').count(),
		0,
	);
	await pause(500);
	eq('the wall stayed on the stage', await wall.locator('iframe.projector__video').count(), 0);
	console.log('\nPASS');
} finally {
	await browser.close();
}
process.exit(0);
