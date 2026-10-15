/* The teacher starts a YouTube video; the class follows it to the library.
 *
 * A perspectives scene holds three YouTube videos. The teacher starts the
 * second one. Asserts Firestore (libraryVideo and a villageCall to the library
 * carry ONE stamp; the stage is not advanced) and a student phone (the video
 * plays muted in the iframe; replaying another video does not touch the class's).
 *
 * Run: npm run solo -- env AGORA_VITE_HOST=http://localhost:<your vite> \
 *        npx tsx apps/agora/scripts/e2e-library-video.mjs
 * (solo.sh pins AGORA_VITE_HOST to 3029, so override it AFTER solo.sh.)
 */
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';
import { createRequire } from 'node:module';

const { AgoraStage } = createRequire(import.meta.url)('@freedi/shared-types');

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });
const runId = `libvid-${Date.now().toString(36)}`;
const VIDEOS = [{ videoId: 'dQw4w9WgXcQ' }, { videoId: 'jNQXAC9IVRw', startSeconds: 3 }, { videoId: 'aqz-KE-bpKQ' }];

step('a lesson at perspectives whose first perspective holds three YouTube videos');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({ stage: AgoraStage.perspectives, students: 2, proposals: 0, quiet: true, runId, teacher });
const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
const session = (await sessionRef.get()).data();
const topicRef = db.collection('agoraTopicPackages').doc(session.topicPackageId);
const scenes = (await topicRef.get()).data().scenes;
const sceneA = scenes.find((scene) => scene.kind === 'perspectiveA');
await topicRef.update({
	scenes: scenes.map((scene) => (scene.sceneId === sceneA.sceneId ? { ...scene, youtubeVideos: VIDEOS } : scene)),
});

const browser = await chromium.launch();
try {
	const student = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
	await student.addInitScript(() => localStorage.setItem('agora_lang', 'he'));
	await student.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(student).catch(() => {});
	await student.waitForSelector('.scene__title', { timeout: 30_000 });
	eq('the student sees the video shelf', await student.locator('.youtube').count(), 1);
	eq('nothing is loaded from YouTube yet', await student.locator('iframe.youtube__iframe').count(), 0);

	step('the teacher opens the peek and starts the second video');
	const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
	await desk.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await desk.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
		`${runId}-teacher`,
	);
	await desk.waitForSelector('.teacher-nav__title', { timeout: 15_000 });
	await desk.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}`, { waitUntil: 'domcontentloaded' });
	const role = desk.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="private"]');
	if (await role.waitFor({ timeout: 6000 }).then(() => true, () => false)) await role.click();
	await desk.locator('button[aria-controls="teacher-peek-body"]').click();
	const rows = desk.locator('.library-videos__row');
	await rows.nth(1).waitFor({ timeout: 10_000 });
	await rows.nth(1).locator('button').click();

	step('one stamp on libraryVideo and the call to the library; the stage did not move');
	const started = await (async () => {
		const deadline = Date.now() + 15_000;
		for (;;) {
			const data = (await sessionRef.get()).data();
			if (data.libraryVideo) return data;
			if (Date.now() > deadline) fail('libraryVideo was never written');
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
	})();
	eq('the chosen video', started.libraryVideo.videoId, 'jNQXAC9IVRw');
	eq('its scene', started.libraryVideo.sceneId, sceneA.sceneId);
	eq('called to the library', started.villageCall.place, 'library');
	eq('one stamp', started.villageCall.at, started.libraryVideo.at);
	eq('stage unchanged', started.stage, AgoraStage.perspectives);

	step('the student lands on that video, muted and autoplaying');
	await student.waitForSelector('iframe.youtube__iframe', { timeout: 20_000 });
	const src = await student.getAttribute('iframe.youtube__iframe', 'src');
	if (!src.includes('/embed/jNQXAC9IVRw') || !src.includes('mute=1') || !src.includes('autoplay=1')) {
		fail(`unexpected embed ${src}`);
	}
	eq('the console marks it as on', await desk.locator('.library-videos__row--now').count(), 1);

	step('the student replays another video; the class video does not change');
	await student.locator('.youtube__chip').first().click();
	await student.waitForFunction(() => document.querySelector('iframe.youtube__iframe')?.src.includes('dQw4w9WgXcQ'));
	eq('class video unchanged', (await sessionRef.get()).data().libraryVideo.videoId, 'jNQXAC9IVRw');
	console.log('\nPASS');
} finally {
	await browser.close();
}
process.exit(0);
