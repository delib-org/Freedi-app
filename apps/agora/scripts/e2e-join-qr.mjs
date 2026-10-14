/* The join QR after the lobby: a latecomer can still be let in.
 *
 * A lesson already at a question. A seated student opens the QR from the
 * stage nav (flat view) and from the gear sheet (village); the link it encodes
 * is followed by a fresh browser, and that browser gets a seat. The teacher
 * re-opens the QR from the console's ≡ menu, and the projector carries a small
 * QR beside the digits on a non-lobby stage. Once the lesson has ended, the
 * student's door is gone.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/e2e-join-qr.mjs [--keep]
 * Screenshots land in output/join-qr/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage } = require('@freedi/shared-types');

await preflight();

const OUT = 'output/join-qr';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `qr-${Date.now().toString(36)}`;

step('a lesson already past the lobby');
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.deliberation,
	students: 3,
	proposals: 2,
	quiet: true,
	runId,
	teacher,
});
console.log(`   session ${run.sessionId} (code ${run.code})`);
const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
const seats = async () =>
	(await db.collection('agoraParticipants').where('sessionId', '==', run.sessionId).get()).size;

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});

/** The sheet is open, shows this lesson's digits, and its QR encodes a join link */
async function readSheet(page, label) {
	const sheet = page.locator('.join-qr');
	await sheet.waitFor({ timeout: 10_000 });
	const digits = (await sheet.locator('.join-qr__digits').innerText()).trim();
	eq(`${label}: digits on the sheet`, digits, run.code);
	const img = sheet.locator('.teacher__qr img');
	await img.waitFor({ timeout: 10_000 });
	const url = await img.getAttribute('alt');
	if (!url || !url.includes(`#!/join/${run.code}`)) fail(`${label}: QR encodes ${url}`);
	console.log(`   ✓ ${label}: QR encodes ${url}`);

	return url;
}

step('a seated student opens the QR from the stage nav (flat view)');
const student = await mkPage(browser, 'student', { width: 390, height: 800 });
await student.goto(run.joinUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(student);
const door = student.locator('.stage-nav__invite');
await door.waitFor({ timeout: 30_000 });
await door.click();
const qrUrl = await readSheet(student, 'student');
await shot(student, '01-student-sheet');
await student.keyboard.press('Escape');
await student.locator('.join-qr').waitFor({ state: 'detached', timeout: 5000 });
console.log('   ✓ Escape closes it');

step('a latecomer follows the link and gets a seat');
const before = await seats();
const late = await mkPage(browser, 'latecomer', { width: 390, height: 800 });
await late.goto(qrUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(late);
for (let i = 0; i < 40 && (await seats()) === before; i++) await pause(500);
eq('seats after the latecomer scanned', await seats(), before + 1);
await late.locator('.stage-nav').waitFor({ timeout: 30_000 });
await shot(late, '02-latecomer-in');

step('in the village the QR is a row in the gear sheet');
await sessionRef.update({ world: 'village' });
await student.goto(`${VITE_HOST}/?world=village#!/join/${run.code}`, {
	waitUntil: 'domcontentloaded',
});
await passNameDoor(student);
const gear = student.locator('.stage-nav__menu');
await gear.waitFor({ timeout: 30_000 });
eq('no stage-nav QR door in the village', await student.locator('.stage-nav__invite').count(), 0);
await gear.click();
await student.locator('.village-more__row', { hasText: 'להזמין לשיעור' }).click();
await readSheet(student, 'village');
await shot(student, '03-village-sheet');
await student.keyboard.press('Escape');

step('the teacher re-opens the QR from the console menu');
const tpage = await mkPage(browser, 'teacher', { width: 1280, height: 800 });
await tpage.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await tpage.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15_000,
});
await tpage.evaluate(
	(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
	`${runId}-teacher`,
);
await tpage.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
await tpage.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}`, {
	waitUntil: 'domcontentloaded',
});
await tpage.locator('.teacher-strip, .teacher-nav__title').first().waitFor({ timeout: 30_000 });
const wall = tpage.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="wall"]');
if (await wall.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
	// The wall: the role that must never see names still gets the QR
	await wall.click();
	await tpage.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
}
await tpage.locator('.teacher-nav__switch').click();
await tpage.locator('.teacher-nav__item--own', { hasText: 'קוד QR להצטרפות' }).click();
await readSheet(tpage, 'teacher');
await shot(tpage, '04-teacher-sheet');
const identities = await tpage.evaluate(
	() => window.__agoraDebug?.().teacherConsole.identitiesSubscribed,
);
eq('the wall never subscribed to names', identities, false);
await tpage.keyboard.press('Escape');

step('the projector keeps a small QR beside the digits after the lobby');
const proj = await mkPage(browser, 'projector', { width: 1280, height: 800 });
await proj.goto(`${VITE_HOST}/#!/teach/screen/${run.sessionId}`, {
	waitUntil: 'domcontentloaded',
});
const card = proj.locator('.projector__code--compact');
await card.waitFor({ timeout: 30_000 });
const projUrl = await card.locator('.teacher__qr img').getAttribute('alt', { timeout: 10_000 });
if (!projUrl?.includes(`#!/join/${run.code}`)) fail(`projector QR encodes ${projUrl}`);
console.log(`   ✓ projector QR encodes ${projUrl}`);
await shot(proj, '05-projector');

step('an ended lesson offers no door');
await sessionRef.update({ world: 'classic' });
await student.goto(run.joinUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(student);
await student.locator('.stage-nav__invite').waitFor({ timeout: 30_000 });
await sessionRef.update({ status: 'ended' });
await student
	.locator('.stage-nav__invite')
	.waitFor({ state: 'detached', timeout: 15_000 })
	.catch(() => fail('the QR door stayed after the lesson ended'));
console.log('   ✓ door gone once the session ended');

if (!KEEP) await browser.close();
console.log('\nPASS e2e-join-qr');
process.exit(0);
