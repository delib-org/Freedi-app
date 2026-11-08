/* The ballot reorders, and every overtake slides.
 *
 * A classic-view voting session where the teacher has revealed the counts and
 * NOT touched the reorder switch (it is on by default). Bot students move their
 * votes twice, forcing two overtakes. Inside the page every animation frame
 * records the row order (by ballot number), the counts the rows show, and the
 * largest vertical shift on screen. A row that teleports never shows a shift.
 *
 * Counts come from the counting trigger; on the emulator the first one after
 * idle can take ~10 s to start, so each overtake is waited for, not timed.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/probe-ballot-reorder.mjs
 */
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, passNameDoor, step } from './lib/e2e.mjs';
import { db, fastlane } from './lib/fastlane.ts';

await preflight();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

step('A revealed ballot with three candidates; the reorder switch left at its default');
const run = await fastlane({ stage: 'voting', students: 5, proposals: 3, quiet: true, runId: `ballot-${Date.now().toString(36)}` });
const sessionRef = db.collection('agoraSessions').doc(run.sessionId);
await sessionRef.update({ 'votingSettings.showResults': true });
const session = (await sessionRef.get()).data();
const candidates = session.voting?.candidates ?? [];
const parentId = session.challengeQuestionId;
if (candidates.length < 3) fail('need at least 3 candidates to force overtakes');
eq('the reorder switch is untouched', session.votingSettings?.liveReorder, undefined);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await mkPage(browser, 'V', { width: 1100, height: 900 });
await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(page, 'בדיקה');
await page.locator('.voting__option').nth(2).waitFor({ timeout: 40000 });
await pause(1500);

await page.evaluate(() => {
	const log = [];
	window.__ballotLog = log;
	let last = '';
	const t0 = performance.now();
	const frame = () => {
		const rows = [...document.querySelectorAll('.voting__option')];
		const number = (r) => r.querySelector('.voting__number')?.textContent ?? '?';
		const order = rows.map(number).join(',');
		const counts = rows.map((r) => `${number(r)}:${r.querySelector('.voting__votes')?.textContent ?? '-'}`).join(' ');
		const shift = rows.reduce((max, r) => {
			const m = getComputedStyle(r).transform.match(/matrix\(([^)]+)\)/);
			return Math.max(max, m ? Math.abs(Number(m[1].split(',')[5])) : 0);
		}, 0);
		const key = `${order}|${counts}|${Math.round(shift / 10)}`;
		if (key !== last) {
			log.push({ t: Math.round(performance.now() - t0), order, counts, shift: Math.round(shift) });
			last = key;
		}
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
});

async function voteAll(statementId) {
	const now = Date.now();
	await Promise.all(
		run.bots.map((bot) =>
			db.collection('votes').doc(`${bot.uid}--${parentId}`).set(
				{
					voteId: `${bot.uid}--${parentId}`,
					statementId,
					userId: bot.uid,
					parentId,
					voter: { uid: bot.uid, displayName: bot.anonName, email: null, photoURL: null, isAnonymous: true },
					createdAt: now,
					lastUpdate: now,
				},
				{ merge: true },
			),
		),
	);
}
/** Wait until the ballot shows `order`, then report whether the move slid */
async function expectOvertake(order, label) {
	const since = await page.evaluate(() => window.__ballotLog.length);
	const reached = await page
		.waitForFunction((o) => window.__ballotLog.some((row) => row.order === o), order, { timeout: 45000 })
		.then(() => true)
		.catch(() => false);
	await pause(1200);
	const rows = await page.evaluate((from) => window.__ballotLog.slice(from), since);
	for (const row of rows) console.log(`   ${String(row.t).padStart(6)}ms  order ${row.order}  [${row.counts}]  shift ${row.shift}px`);
	if (!reached) fail(`${label}: the ballot never reordered to ${order}`);
	const slid = Math.max(0, ...rows.filter((row) => row.order === order).map((row) => row.shift));
	eq(`${label}: the overtake slid into place (largest shift > 40px)`, slid > 40, true);
	// The log only records a frame when the shift crosses a 10px bucket, so ask
	// the rows themselves: every one back at its resting place (the ballot's own
	// 2px lift is the baseline the page starts with).
	const resting = await page.evaluate(() =>
		[...document.querySelectorAll('.voting__option')].every((r) => {
			const m = getComputedStyle(r).transform.match(/matrix\(([^)]+)\)/);
			return (m ? Math.abs(Number(m[1].split(',')[5])) : 0) <= 3 && r.getAnimations().length === 0;
		}),
	);
	eq(`${label}: and came to rest`, resting, true);
}

step(`Every bot votes for candidate #${candidates.length}: it overtakes to the top`);
await voteAll(candidates[candidates.length - 1].statementId);
await expectOvertake(`${candidates.length},1,2`, 'first overtake');

step('Every bot moves to candidate #2: it overtakes #3');
await voteAll(candidates[1].statementId);
await expectOvertake('2,1,3', 'second overtake');

console.log('\nPASS — the ballot follows the revealed counts, and each overtake slides');
await browser.close();
process.exit(0);
