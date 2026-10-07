/* News on the village board, end to end.
 *
 * A student in the 3D village gets no toast they can find again — the board
 * must say where the news is. This walks both directions through real
 * Firestore writes and the real seen-state:
 *
 *   1. a classmate sends an idea on MY note → a chip on my card, a badge on
 *      the board door, a chip on that conversation's row;
 *   2. opening the conversation clears all three and the read mark lands on
 *      the participant doc (so a refresh stays quiet);
 *   3. I write to a classmate and the OWNER answers → a chip on their card,
 *      the badge again; reading clears it.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/e2e-village-news.mjs [--keep] [--shot=prefix]
 * Screenshots land in output/village-news/.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, positionStudent } from './lib/fastlane.ts';

// shared-types is require-only from plain Node (see lib/fastlane.ts); the
// message builder is required the same way so a planted line cannot drift
// from what the app itself writes.
const require = createRequire(import.meta.url);
const { AgoraMessageKind, Collections, createAgoraParticipantId, createAgoraThreadKey } =
	require('@freedi/shared-types');
const { buildThreadMessageStatement } = require('../src/lib/statementDocs');

await preflight();

const OUT = 'output/village-news';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const PREFIX = (process.argv.find((a) => a.startsWith('--shot='))?.split('=')[1] ?? 'run') + '-';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

step('A village lesson at the solutions booth, two classmates already on the board');
const run = await fastlane({
	stage: 'deliberation',
	students: 2,
	proposals: 2,
	ratings: false,
	stagePlan: [
		{ itemId: 'lobby', stage: 'lobby' },
		{ itemId: 'deliberation', stage: 'deliberation' },
		{ itemId: 'results', stage: 'results' },
	],
	runId: `village-news-${Date.now().toString(36)}`,
	quiet: true,
});
const sessionRef = db.collection(Collections.agoraSessions).doc(run.sessionId);
await sessionRef.update({ world: 'village' });
const session = (await sessionRef.get()).data();
console.log(`   session ${run.sessionId} (code ${run.code})`);

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
const boardBadge = door('board').locator('.place-bar__badge');
const ownCard = page.locator('.village-note--own');
const chips = page.locator('.village-note__chip');
const panel = page.locator('.village-community__panel');

/** Stand in the village (the board door is not the one I am behind, so its badge may show) */
async function toVillage() {
	await clearCelebration(page, 'S1');
	await door('village').click();
	await guideBubble.waitFor({ state: 'visible', timeout: 15000 });
}
async function toBoard() {
	await clearCelebration(page, 'S1');
	await door('board').click();
	await panel.waitFor({ timeout: 15000 });
}
/** A line in a conversation, written the way the app writes it */
async function plant(noteId, author, text, kind, threadUserId) {
	const ref = db.collection(Collections.statements).doc();
	const statement = buildThreadMessageStatement(
		session,
		noteId,
		ref.id,
		author.uid,
		author.anonName,
		text,
		kind,
		threadUserId,
	);
	await ref.set(statement);

	return statement;
}
async function myStatements() {
	const snap = await db
		.collection(Collections.statements)
		.where('agoraSessionId', '==', run.sessionId)
		.where('creatorId', '==', uid)
		.get();

	return snap.docs.map((d) => d.data());
}
async function participant() {
	const snap = await db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(run.sessionId, uid))
		.get();

	return snap.data() ?? {};
}

step('S1 writes a note; the board opens with it and nothing is new yet');
await guideBubble.waitFor({ state: 'visible', timeout: 40000 });
await clearCelebration(page, 'S1');
await writeButton.click();
await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 15000 });
const input = bubble.locator('textarea').first();
await input.waitFor({ timeout: 15000 });
await input.fill('ועדה של שלושה נציגים שמתחלפת כל חודש ומביאה הצעות לאישור כל הכיתה.');
await clearCelebration(page, 'S1');
await bubble.locator('button.btn--primary').first().click();
await panel.waitFor({ timeout: 25000 });
await ownCard.waitFor({ timeout: 15000 });
await pause(1200);
await clearCelebration(page, 'S1');
eq('no chip before anyone wrote', await chips.count(), 0);
let myNote;
await expect
	.poll(async () => {
		myNote = (await myStatements()).find((s) => s.statementType !== 'suggestion');

		return myNote?.statementId ?? null;
	})
	.not.toBeNull();
await shot(page, `${PREFIX}00-board-quiet`);

step('A classmate sends an idea on my note: chip on my card, badge on the board door');
const helperBot = run.bots[0];
const idea = await plant(
	myNote.statementId,
	helperBot,
	'אולי כדאי להוסיף נציג שמתחלף כל שבועיים, כדי שיותר תלמידים יתנסו.',
	AgoraMessageKind.suggestion,
	helperBot.uid,
);
await expect(ownCard.locator('.village-note__chip')).toContainText('1', { timeout: 15000 });
eq(
	'the chip speaks a sentence, not an icon and a digit',
	await ownCard.locator('.village-note__chip').getAttribute('aria-label'),
	'הודעה חדשה אחת',
);
eq('the classmates’ cards stay quiet', await page.locator('.village-note:not(.village-note--own) .village-note__chip').count(), 0);
await pause(400);
await shot(page, `${PREFIX}01-own-card-chip`);
eq('standing on the board, the board door wears no badge', await boardBadge.count(), 0);
await toVillage();
await expect(boardBadge).toHaveText('1', { timeout: 10000 });
await pause(400);
await shot(page, `${PREFIX}02-board-door-badge`);

step('The conversation row says what is new in it; opening it clears everything');
await toBoard();
await ownCard.locator('.village-note__open').click();
const rows = panel.locator('button.village-note');
await expect(rows).toHaveCount(1);
await expect(rows.first().locator('.village-note__chip')).toContainText('1');
eq('the row is flagged', (await rows.first().getAttribute('class')).includes('village-note--news'), true);
await pause(400);
await shot(page, `${PREFIX}03-thread-row-chip`);
await rows.first().click();
await page.locator('.chat-page').waitFor({ timeout: 10000 });
await pause(600);
await clearCelebration(page, 'S1');
await page.locator('.chat-page__back').click();
await page.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await expect(rows.first().locator('.village-note__chip')).toHaveCount(0);
await toVillage();
eq('the badge is gone once the conversation was read', await boardBadge.count(), 0);
await expect
	.poll(async () => (await participant()).seenThreads?.[createAgoraThreadKey(myNote.statementId, helperBot.uid)] ?? 0, {
		timeout: 12000,
	})
	.toBeGreaterThanOrEqual(idea.createdAt);
console.log('   ✓ the read mark reached the participant doc');
await toBoard();
eq('no chip after reading', await chips.count(), 0);

step('I write to a classmate and the OWNER answers: chip on their card, badge on the door');
const classmate = page.locator('.village-note:not(.village-note--own)').first();
await classmate.locator('.village-note__open').click();
await page.locator('.chat-page__input').waitFor({ timeout: 10000 });
await page.locator('.chat-page__input').fill('כדאי לקבוע לוח זמנים לביטול זכויות היתר.');
await clearCelebration(page, 'S1');
await page.locator('.chat-page__send').click();
await pause(1500);
await clearCelebration(page, 'S1');
await page.locator('.chat-page__back').click();
await page.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
let theirNoteId;
await expect
	.poll(async () => {
		theirNoteId = (await myStatements()).find((s) => s.statementType === 'suggestion')?.parentId;

		return theirNoteId ?? null;
	})
	.not.toBeNull();
const theirNote = (await db.collection(Collections.statements).doc(theirNoteId).get()).data();
const ownerBot = run.bots.find((b) => b.uid === theirNote.creatorId);
if (!ownerBot) fail(`no bot owns ${theirNoteId}`);
eq('no chip while the owner is silent', await chips.count(), 0);
const reply = await plant(
	theirNoteId,
	ownerBot,
	'תודה! תוכלו לחדד מי אוכף את לוח הזמנים?',
	AgoraMessageKind.chat,
	uid,
);
const theirCard = page.locator('.village-note--news:not(.village-note--own)');
await expect(theirCard).toHaveCount(1, { timeout: 15000 });
await expect(theirCard.locator('.village-note__chip')).toContainText('1');
eq('my own card stays quiet', await ownCard.locator('.village-note__chip').count(), 0);
await pause(400);
await shot(page, `${PREFIX}04-classmate-card-chip`);
// The same board on a phone: the chip must not push the title off the head
await page.setViewportSize({ width: 390, height: 844 });
await pause(600);
await expect(theirCard.locator('.village-note__chip')).toBeVisible();
await shot(page, `${PREFIX}04b-phone-classmate-card-chip`);
await page.setViewportSize({ width: 1360, height: 860 });
await pause(400);
await toVillage();
await expect(boardBadge).toHaveText('1', { timeout: 10000 });
await pause(400);
await shot(page, `${PREFIX}05-board-door-badge-reply`);

step('Reading the answer clears it, and the mark lands');
await toBoard();
await theirCard.locator('.village-note__open').click();
await page.locator('.chat-page').waitFor({ timeout: 10000 });
await expect(page.locator('.chat-page .thread__msg--peer', { hasText: 'מי אוכף' })).toBeVisible({ timeout: 10000 });
await pause(600);
await clearCelebration(page, 'S1');
await page.locator('.chat-page__back').click();
await page.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await expect(chips).toHaveCount(0);
await expect
	.poll(async () => (await participant()).seenThreads?.[createAgoraThreadKey(theirNoteId, uid)] ?? 0, {
		timeout: 12000,
	})
	.toBeGreaterThanOrEqual(reply.createdAt);
await toVillage();
eq('no badge after reading the answer', await boardBadge.count(), 0);
await shot(page, `${PREFIX}06-quiet-again`);

console.log('\n✓ village news: chips on the cards, a badge on the board door, cleared by reading');
if (KEEP) {
	console.log('   --keep: the browser stays open');
} else {
	await browser.close();
	process.exit(0);
}
