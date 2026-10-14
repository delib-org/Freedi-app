/* The join QR after the lobby: the teacher can still let a latecomer in.
 *
 * A lesson already past the lobby. Students have no QR door — not in the
 * stage nav, not in the village gear sheet. The teacher re-opens the QR from
 * the console's ≡ menu (on a wall device, which must never subscribe to
 * names); a fresh browser follows the link it encodes and gets a seat. The
 * projector's small QR is off after the lobby until the teacher switches it
 * on from the same menu, follows the switch live, and disappears again when
 * it is switched off and once the lesson has ended.
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
const SHOW_QR = 'קוד QR להצטרפות';
const PROJECTOR_ON = 'הצגת QR במקרן';
const PROJECTOR_OFF = 'הסתרת ה־QR מהמקרן';

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

step('a seated student has no QR door — flat view');
const student = await mkPage(browser, 'student', { width: 390, height: 800 });
await student.goto(run.joinUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(student);
await student.locator('.stage-nav').waitFor({ timeout: 30_000 });
await pause(1500);
eq('student QR doors (flat)', await student.locator('.stage-nav__invite, .join-qr').count(), 0);
eq('QR glyphs on the student screen', await student.locator('.teacher__qr').count(), 0);

step('…nor in the village gear sheet');
await sessionRef.update({ world: 'village' });
await student.goto(`${VITE_HOST}/?world=village#!/join/${run.code}`, {
	waitUntil: 'domcontentloaded',
});
await passNameDoor(student);
const gear = student.locator('.stage-nav__menu');
await gear.waitFor({ timeout: 30_000 });
await gear.click();
await student.locator('.village-more').waitFor({ timeout: 10_000 });
eq(
	'gear-sheet invite rows',
	await student.locator('.village-more__row', { hasText: 'להזמין' }).count(),
	0,
);
await shot(student, '01-student-gear-no-qr');
await student.keyboard.press('Escape');
await sessionRef.update({ world: 'classic' });

step('the teacher re-opens the QR from the console menu, on a wall');
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
await tpage.locator('.teacher-nav__title').waitFor({ timeout: 30_000 });
const wall = tpage.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="wall"]');
if (await wall.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
	await wall.click();
	await tpage.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
}
const menuItem = async (text) => {
	await tpage.locator('.teacher-nav__switch').click();
	await tpage.locator('.teacher-nav__item--own', { hasText: text }).click();
};
await menuItem(SHOW_QR);
const qrUrl = await readSheet(tpage, 'teacher');
await shot(tpage, '02-teacher-sheet');
eq(
	'the wall never subscribed to names',
	await tpage.evaluate(() => window.__agoraDebug?.().teacherConsole.identitiesSubscribed),
	false,
);
await tpage.keyboard.press('Escape');
await tpage.locator('.join-qr').waitFor({ state: 'detached', timeout: 5000 });

step('a latecomer follows the teacher QR link and gets a seat');
const before = await seats();
const late = await mkPage(browser, 'latecomer', { width: 390, height: 800 });
await late.goto(qrUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(late);
for (let i = 0; i < 40 && (await seats()) === before; i++) await pause(500);
eq('seats after the latecomer scanned', await seats(), before + 1);

step('the projector QR is off after the lobby until the teacher turns it on');
const proj = await mkPage(browser, 'projector', { width: 1280, height: 800 });
await proj.goto(`${VITE_HOST}/#!/teach/screen/${run.sessionId}`, {
	waitUntil: 'domcontentloaded',
});
await proj.locator('.projector__code-value').waitFor({ timeout: 30_000 });
await pause(1000);
eq('projector QR by default', await proj.locator('.projector__code .teacher__qr').count(), 0);
await shot(proj, '03-projector-off');

await menuItem(PROJECTOR_ON);
const card = proj.locator('.projector__code--compact .teacher__qr img');
await card.waitFor({ timeout: 15_000 });
const projUrl = await card.getAttribute('alt');
if (!projUrl?.includes(`#!/join/${run.code}`)) fail(`projector QR encodes ${projUrl}`);
console.log(`   ✓ switched on, projector QR encodes ${projUrl}`);
eq('session.projectorQr', (await sessionRef.get()).data().projectorQr, true);
await shot(proj, '04-projector-on');

await menuItem(PROJECTOR_OFF);
await proj
	.locator('.projector__code .teacher__qr')
	.waitFor({ state: 'detached', timeout: 15_000 })
	.catch(() => fail('the projector QR stayed after switching off'));
console.log('   ✓ switched off, projector QR gone');

step('an ended lesson: no QR even if switched on');
await sessionRef.update({ projectorQr: true, status: 'ended' });
await pause(2000);
eq('projector QR once ended', await proj.locator('.projector__code .teacher__qr').count(), 0);

if (!KEEP) await browser.close();
console.log('\nPASS e2e-join-qr');
process.exit(0);
