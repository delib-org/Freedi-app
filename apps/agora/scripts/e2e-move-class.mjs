/* The teacher's call moves the class — solidly.
 *
 * In production (session 4Iy3FyKmCpQ-, 2026-10-12) the teacher called the
 * students to a booth and nobody moved. The call was judged by its age on
 * first sight (a locked phone met it "too late"), the flat view only
 * toasted, and the 3D walk was the condition for the station rather than
 * the picture of it. This walks the fixed model: a call is a standing
 * order, honoured once per device however late it is met, in both worlds.
 *
 * A WizCol lesson at its first question with four bots. Five browser
 * students join: one in the 3D village, one in the simple view, one
 * mid-sentence at the desk, one offline when the call comes, and one who
 * joins after it. The teacher presses NEXT (the led room walks as one, the
 * roamer included), then gathers everyone back at the story booth. Every
 * student's participant doc reports `whereabouts` at that booth with the
 * call's stamp — Firestore state, not pixels — and the teacher's sheet
 * fills to 9 of 9 once the bots' phones (written here) report too. Then the
 * simple-view student goes back to the 3D village and a reload keeps it.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/e2e-move-class.mjs [--keep] [--out=dir]
 * Screenshots land in output/move-class/.
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, stagePlanPreset, createAgoraParticipantId } = require('@freedi/shared-types');

await preflight();

const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
const OUT = outFlag ? outFlag.slice('--out='.length) : 'output/move-class';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `mc-${Date.now().toString(36)}`;

step('a WizCol lesson at its first question, in the village, four bots seated');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.question,
	students: 4,
	proposals: 0,
	quiet: true,
	runId,
	teacher,
	quick: { title: 'טיול שנתי', mainQuestion: 'לאן ניסע בטיול השנתי?', language: 'he' },
	stagePlan: stagePlanPreset('wizcol'),
});
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`   session ${run.sessionId} (code ${run.code})`);

const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
const sessionDoc = async () => (await sessionRef.get()).data();
const participantDoc = async (uid) =>
	(await db.collection('agoraParticipants').doc(createAgoraParticipantId(run.sessionId, uid)).get()).data();

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});

/** A student page: light world (headless), joined through the door, uid read back */
const joinStudent = async (label, name) => {
	const page = await mkPage(browser, label, { width: 420, height: 880 });
	await page.addInitScript(() => localStorage.setItem('agora_village_lite', '1'));
	await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(page, name);
	await page.locator('.game, .shell').first().waitFor({ timeout: 30_000 });
	let uid = null;
	for (let attempt = 0; attempt < 60 && !uid; attempt++) {
		uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
		if (!uid) await pause(250);
	}
	if (!uid) fail(`${label} has no uid`);

	return { page, uid, label };
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

/** The whereabouts every phone reports, polled from Firestore */
const expectAt = async (student, place, callAt) => {
	await expect
		.poll(async () => (await participantDoc(student.uid))?.whereabouts?.place, { timeout: 45_000 })
		.toBe(place);
	if (callAt !== undefined) {
		eq(`${student.label} answered THIS call`, (await participantDoc(student.uid)).whereabouts.callAt, callAt);
	}
};

try {
	step('five students: village, simple view, mid-sentence, offline, and one still outside');
	const village = await joinStudent('village', 'נועה');
	const flat = await joinStudent('flat', 'איתן');
	const typing = await joinStudent('typing', 'מאיה');
	const offline = await joinStudent('offline', 'יונתן');
	await village.page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });

	// The simple view, chosen from the village's gear sheet
	await flat.page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await flat.page.locator('.stage-nav__menu').click();
	await flat.page.locator('.village-more').waitFor({ timeout: 5000 });
	await flat.page.locator('.village-more__row--exit').click();
	await expect(flat.page.locator('iframe.village-shell__world')).toHaveCount(0);
	await flat.page.locator('.village-mode-toggle').waitFor({ timeout: 10_000 });
	console.log('   ✓ one student in the simple view');

	// The roamer: the village student steps back to an opened station later;
	// at the first question there is nowhere to roam yet, so NEXT is tested
	// on a student who stays, and the gather on students who are ahead.
	await pause(3000);

	step('NEXT: the led room walks as one to the needs question');
	const desk = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await signInTeacherPage(desk);
	await desk.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}/class`, {
		waitUntil: 'domcontentloaded',
	});
	await desk.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
	await answerRole(desk);
	await desk.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await pause(2500);
	const before = (await sessionDoc()).stageIndex ?? 0;
	await desk.locator('#teacher-next').click();
	await expect.poll(async () => (await sessionDoc()).stageIndex ?? 0, { timeout: 30_000 }).toBe(before + 1);
	await expectAt(village, 'booth:round-needs');
	await expectAt(flat, 'booth:round-needs');
	await expectAt(typing, 'booth:round-needs');
	await expectAt(offline, 'booth:round-needs');
	console.log('   ✓ four phones report the needs booth');

	step('one student is mid-sentence at the desk; one phone goes offline');
	await typing.page.locator('.place-bar__item[data-place="note"]').click();
	const box = typing.page.locator('.village-desk textarea').first();
	await box.waitFor({ timeout: 15_000 });
	await box.fill('הצורך שלי הוא לישון באוהל ליד');
	await offline.page.context().setOffline(true);
	await pause(500);

	step('the teacher gathers everyone at the story booth (a past station)');
	// The card must be caught while it is on screen: arm the waits before the tap
	const cards = Promise.all([
		village.page.waitForSelector('.stage-transition[data-call="true"]', { timeout: 20_000 }),
		flat.page.waitForSelector('.stage-transition[data-call="true"]', { timeout: 20_000 }),
	]);
	await desk.locator('.teacher-strip__pennant').click();
	await desk.locator('#teacher-move').waitFor({ timeout: 10_000 });
	await desk.locator('.move-class__row[data-move="gather"][data-item="round-story"]').click();
	await expect
		.poll(async () => (await sessionDoc()).villageCall?.place, { timeout: 15_000 })
		.toBe('booth:round-story');
	const callAt = (await sessionDoc()).villageCall.at;
	await cards;
	console.log('   ✓ the call card showed in the village and in the simple view');
	await shot(flat.page, 'flat-called');

	step('village and simple-view students are at the story booth');
	await expectAt(village, 'booth:round-story', callAt);
	await expectAt(flat, 'booth:round-story', callAt);
	await expect(flat.page.locator('.stage-nav__past')).toBeVisible({ timeout: 10_000 });

	step('the typist is held with a countdown, keeps the pen, and goes on "go now"');
	const banner = typing.page.locator('[data-call-banner]');
	await banner.waitFor({ timeout: 15_000 });
	await expect(banner).toContainText(/קורא/);
	await shot(typing.page, 'typing-held');
	eq('the typist has not been moved yet', (await participantDoc(typing.uid)).whereabouts.place, 'booth:round-needs');
	await typing.page.locator('.call-banner__go').click();
	await expectAt(typing, 'booth:round-story', callAt);
	await expect(banner).toHaveCount(0);

	step('the teacher sees the arrivals fill: three of nine, then the bots report');
	const arrivals = desk.locator('.move-class__arrivals');
	await expect.poll(async () => Number(await arrivals.getAttribute('data-arrived')), { timeout: 20_000 }).toBe(3);
	eq('eight seats so far', await arrivals.getAttribute('data-total'), '8');
	await shot(desk, 'teacher-arrivals-partial');
	// The bots' phones: written as the client writes them
	await Promise.all(
		run.bots.map((bot) =>
			db
				.collection('agoraParticipants')
				.doc(bot.participantId)
				.update({ whereabouts: { place: 'booth:round-story', at: Date.now(), callAt } }),
		),
	);
	await expect.poll(async () => Number(await arrivals.getAttribute('data-arrived')), { timeout: 20_000 }).toBe(7);
	await expect(desk.locator('.move-class__waiting')).toContainText(/\S/);
	console.log('   ✓ the straggler is named');

	step('the offline phone comes back and catches up — however late');
	await pause(4000);
	await offline.page.context().setOffline(false);
	await expectAt(offline, 'booth:round-story', callAt);
	await expect(arrivals).toHaveClass(/move-class__arrivals--all/, { timeout: 20_000 });
	await shot(desk, 'teacher-arrivals-all');
	console.log('   ✓ everyone is at the story booth');

	step('a late joiner lands where the class is');
	const late = await joinStudent('late', 'רוני');
	await expectAt(late, 'booth:round-story', callAt);
	eq('the room has nine seats', await arrivals.getAttribute('data-total'), '9');
	await expect(arrivals).toHaveClass(/move-class__arrivals--all/, { timeout: 20_000 });

	step('the call is in every post box, once');
	eq(
		'one call row',
		await village.page.evaluate(
			(id) =>
				JSON.parse(sessionStorage.getItem(`agora_${id}_inbox`) ?? '[]').filter(
					(item) => item.trigger === 'agora_called_to',
				).length,
			run.sessionId,
		),
		1,
	);

	step('a reload does not walk twice: the handled stamp is remembered');
	await village.page.reload({ waitUntil: 'domcontentloaded' });
	await village.page.locator('.game').waitFor({ timeout: 30_000 });
	eq(
		'the stamp survived the reload',
		await village.page.evaluate((id) => sessionStorage.getItem(`agora_${id}_call`), run.sessionId),
		String(callAt),
	);

	step('the simple-view student goes back to the 3D village, and a reload keeps it');
	await flat.page.locator('.village-mode-toggle').click();
	await flat.page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	eq('the choice is remembered', await flat.page.evaluate(() => localStorage.getItem('agora_village_view')), 'village');
	await flat.page.reload({ waitUntil: 'domcontentloaded' });
	await flat.page.locator('iframe.village-shell__world').waitFor({ timeout: 30_000 });
	await shot(flat.page, 'flat-back-in-3d');
	console.log('   ✓ back in the village after a reload');

	step('the lobby of a simple-view lesson has the door back to the village too');
	await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'classic' });
	const lobbyRun = await fastlane({
		stage: AgoraStage.lobby,
		students: 0,
		quiet: true,
		runId: `${runId}-lobby`,
		teacher,
		quick: { title: 'לובי', mainQuestion: 'שאלה?', language: 'he' },
		stagePlan: stagePlanPreset('wizcol'),
	});
	await db.collection('agoraSessions').doc(lobbyRun.sessionId).update({ world: 'classic' });
	const lobby = await mkPage(browser, 'lobby', { width: 420, height: 880 });
	await lobby.goto(`${VITE_HOST}/#!/join/${lobbyRun.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(lobby, 'גל');
	await lobby.locator('.lobby__intro').waitFor({ timeout: 30_000 });
	await expect(lobby.locator('.village-mode-toggle')).toBeVisible({ timeout: 10_000 });
	await lobby.close();

	console.log('\n✅ e2e-move-class passed');
} finally {
	if (!KEEP) await browser.close();
}
process.exit(0);
