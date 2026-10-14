/* The village board shows a student their hand, not the whole class.
 *
 * Nine students, eight notes. A real student joins, writes at the desk and
 * opens the board: their own note plus five classmates' — never all eight —
 * with the hand line under them. A ninth note posted late does not land on
 * a full, unrated hand. The server side is covered by e2e-hand.mjs; this is
 * the board.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/e2e-hand-board.mjs [--keep]
 */
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, fail, mkPage, passNameDoor, step } from './lib/e2e.mjs';
import { db, fastlane, positionStudent, proposeAs, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AGORA_LOTTERY, AgoraStage, Collections } = require('@freedi/shared-types');
const KEEP = process.argv.includes('--keep');

await preflight();

let failures = 0;
const check = (ok, what) => {
	console.info(`   ${ok ? '✓' : '✗'} ${what}`);
	if (!ok) failures += 1;
};

step('1. Nine students, eight notes, the village at the square');
const runId = `hand-board-${Date.now().toString(36)}`;
const teacher = await signInTeacher(`${runId}-teacher`);
const run = await fastlane({
	stage: AgoraStage.deliberation,
	students: 9,
	proposals: 8,
	ratings: false,
	runId,
	teacher,
	quiet: true,
});
const sessionRef = db.collection(Collections.agoraSessions).doc(run.sessionId);
await sessionRef.update({ world: 'village' });
const latecomer = run.bots.find((bot) => !bot.proposalId);
console.info(`   session ${run.sessionId} (code ${run.code})`);

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
const page = await mkPage(browser, 'S1', { width: 1360, height: 860 });
await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(page, 'נועה');
await page.locator('iframe.village-shell__world').waitFor({ timeout: 30000 });
const uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
if (!uid) fail('the student has no uid');
await positionStudent(run.sessionId, uid, 20);

const world = page.frameLocator('iframe.village-shell__world');
const guideBubble = world.locator('#desk-bubble');
const writeButton = world.locator('#desk-write');
const bubble = page.locator('.village-bubble');
const door = (place) => page.locator(`.place-bar__item[data-place="${place}"]`);
const panel = page.locator('.village-community__panel');
const ownCard = page.locator('.village-note--own');
const peerCards = page.locator('.village-board__peers .village-note');
const handLine = page.locator('.hand__line');

step('2. S1 writes a note at the desk');
await guideBubble.waitFor({ state: 'visible', timeout: 40000 });
await clearCelebration(page, 'S1');
await writeButton.click();
await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 15000 });
const input = bubble.locator('textarea').first();
await input.waitFor({ timeout: 15000 });
await input.fill('ועדה של שלושה נציגים שמתחלפת כל חודש ומביאה הצעות לאישור כל הכיתה.');
await bubble.locator('button.btn--primary').first().click();
await page.waitForTimeout(1500);
await clearCelebration(page, 'S1');

step('3. The board shows my note and a hand of five — not all eight');
await door('board').click();
await panel.waitFor({ timeout: 15000 });
await handLine.waitFor({ timeout: 20000 }).catch(() => {});
await page.waitForTimeout(500);
const own = await ownCard.count();
const peers = await peerCards.count();
check(own === 1, `my own card (${own})`);
check(peers === AGORA_LOTTERY.HAND_SIZE, `${peers} classmates' cards (hand of ${AGORA_LOTTERY.HAND_SIZE}, class has 8)`);
check((await handLine.count()) === 1, `hand line: "${(await handLine.textContent().catch(() => '')) ?? ''}"`);
const handDoc = (await db.collection(Collections.agoraHands).doc(`${run.sessionId}--${uid}`).get()).data();
const hand = handDoc?.hands?.[(await sessionRef.get()).data().challengeQuestionId] ?? [];
check(hand.length === AGORA_LOTTERY.HAND_SIZE, `agoraHands holds ${hand.length}`);
const shownIds = await peerCards.evaluateAll((cards) => cards.map((c) => c.dataset.statementId ?? c.getAttribute('data-id') ?? ''));
const shownText = await peerCards.allTextContents();
check(shownText.every((text) => text.trim().length > 0), 'every shown card has text');
void shownIds;

step('4. A late ninth note does not land on a full, unrated hand');
await proposeAs(run.sessionId, latecomer.uid, 'הצעה מאוחרת: לפתוח את הדיון מחדש בכל שבוע.');
await page.waitForTimeout(4000);
check((await peerCards.count()) === AGORA_LOTTERY.HAND_SIZE, `still ${await peerCards.count()} classmates' cards`);
await page.screenshot({ path: 'output/hand-board.png' }).catch(() => {});

step('5. The teacher, watching the room read-only, sees every note');
const tpage = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
await tpage.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await tpage.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15000 });
for (let attempt = 0; attempt < 3; attempt++) {
	await tpage.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
		`${runId}-teacher`,
	);
	const ok = await tpage.waitForSelector('.teacher-nav__title', { timeout: 15000 }).then(() => true, () => false);
	if (ok) break;
	if (attempt === 2) fail('teacher sign-in never took');
}
await tpage.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}/class`, { waitUntil: 'domcontentloaded' });
// A laptop is asked once where it is (private screen or the class wall); its scrim
// covers the place bar until answered — as e2e-class-view answers it.
const roleChoice = tpage.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="private"]');
if (await roleChoice.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
	await roleChoice.click();
	await tpage.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
}
await tpage.locator('iframe.village-shell__world').waitFor({ timeout: 30000 });
await tpage.waitForTimeout(4000);
await tpage.locator('.place-bar__item[data-place="board"]').click();
await tpage.locator('.village-board').waitFor({ timeout: 10000 });
await tpage.waitForTimeout(800);
const teacherCards = await tpage.locator('.village-board .village-note').count();
// 8 bots + S1 + the late ninth bot = 10 notes
check(teacherCards === 10, `teacher sees ${teacherCards} notes (all 10)`);
check((await tpage.locator('.hand').count()) === 0, 'no hand line for the teacher');
await tpage.screenshot({ path: 'output/hand-board-teacher.png' }).catch(() => {});

if (!KEEP) await browser.close();
console.info(failures === 0 ? '\nPASS: the board deals a hand' : `\nFAIL: ${failures} checks failed`);
process.exit(failures === 0 ? 0 : 1);
