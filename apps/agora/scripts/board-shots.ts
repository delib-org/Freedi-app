/* Screenshots of the results map, for eyeballing the field / help redesign.
 *
 *   npx tsx scripts/board-shots.ts            # Hebrew, phone
 *   AGORA_LANG=en npx tsx scripts/board-shots.ts
 *
 * Lands a real student on the live class map (the deliberation Results tab,
 * which renders the same ResultsBoard the ending does) with a class of bots
 * who have already rated, so the field actually has points on it.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AgoraSession, Evaluation } from '@freedi/shared-types';
import { FIRESTORE_HOST, preflight } from './lib/preflight.mjs';
import { fastlane, positionStudent, proposeAs } from './lib/fastlane';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections } = require(
	'@freedi/shared-types',
) as typeof import('@freedi/shared-types');
const { agoraCreator } = require('../src/lib/statementDocs') as typeof import('../src/lib/statementDocs');

const LANG = process.env.AGORA_LANG ?? 'he';
const SHOTS = 'board-shots';

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });
const result = await fastlane({ stage: AgoraStage.deliberation, students: 8, proposals: 5 });
console.log('   session', result.sessionId, 'code', result.code);

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'freedi-test' }));
const session = (
	await db.collection(Collections.agoraSessions).doc(result.sessionId).get()
).data() as AgoraSession;

/**
 * Bots rate, so the field actually has points on it — and they rate in a
 * SHAPE: one proposal both camps back (it belongs in the bridge zone), one
 * only the left camp backs, one only the right, one the whole class is against.
 * A map whose every point lands in the same place proves nothing about a map.
 */
const SHAPES: ReadonlyArray<(camp: string) => number> = [
	() => 1, // everyone loves it — top centre, the bridge
	(camp) => (camp === 'left' ? 1 : camp === 'right' ? -0.5 : 0.5),
	(camp) => (camp === 'right' ? 1 : camp === 'left' ? -1 : 0),
	() => -0.5, // the class is against it
	(camp) => (camp === 'center' ? 1 : 0.5),
];
const rated = result.bots.filter((bot) => bot.proposalId);
for (const [index, target] of rated.entries()) {
	const shape = SHAPES[index % SHAPES.length];
	for (const rater of result.bots) {
		if (rater.uid === target.uid) continue;
		const statementId = target.proposalId as string;
		const evaluationId = `${rater.uid}--${statementId}`;
		const evaluation: Evaluation = {
			evaluationId,
			parentId: session.challengeQuestionId,
			statementId,
			evaluatorId: rater.uid,
			evaluation: shape(rater.camp),
			evaluator: agoraCreator(rater.uid, rater.anonName),
			agoraSessionId: result.sessionId,
			updatedAt: Date.now(),
		};
		await db.collection(Collections.evaluations).doc(evaluationId).set(evaluation);
	}
}
// The score docs are written by a Firestore trigger, one per rating. WAIT for
// them rather than sleeping a guessed number of seconds: a short sleep is how
// this helper twice screenshotted an empty field and called it a layout.
const deadline = Date.now() + 60_000;
let scored = 0;
while (scored < rated.length && Date.now() < deadline) {
	const snap = await db
		.collection(Collections.agoraScores)
		.where('sessionId', '==', result.sessionId)
		.get();
	scored = snap.docs.filter((doc) => doc.get('classConsensus')).length;
	if (scored < rated.length) await new Promise((resolve) => setTimeout(resolve, 1500));
}
if (scored < rated.length) throw new Error(`only ${scored}/${rated.length} proposals scored`);
console.log(`   ✓ ${rated.length} proposals rated and scored by the class`);

mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.addInitScript((lang: string) => window.localStorage.setItem('agora_lang', lang), LANG);
page.on('pageerror', (error) => console.log('[PAGEERROR]', error.message.slice(0, 300)));
page.on('console', (msg) => {
	if (msg.type() === 'error') console.log('[CONSOLE]', msg.text().slice(0, 300));
});

await page.goto(result.joinUrl, { waitUntil: 'domcontentloaded' });

// The gate, not the square: an uncamped student is held on the positioning
// screen (see GameController), so waiting for a deliberation container before
// writing the camp would wait for the very thing the camp write unlocks.
await page.waitForSelector(
	'input.camp-scale__slider, .chat-log, .delib-hud, .proposal-dock__bar',
	{ timeout: 40_000 },
);

const uid = await page.evaluate(
	() =>
		(window as unknown as { __agoraDebug?: () => { user?: { user?: { uid?: string } } } })
			.__agoraDebug?.()?.user?.user?.uid ?? null,
);
if (!uid) throw new Error('no uid on the opened student');
await positionStudent(result.sessionId, uid, 20);
await proposeAs(result.sessionId, uid, 'שנקים מועצת אזרחים שנבחרת בגורל בכל עיר');
await page.waitForSelector('.chat-log, .delib-hud, .proposal-dock__bar', { timeout: 40_000 });
await page.waitForTimeout(3500);
// A celebration is modal and would sit over every shot
await page.locator('.celebration__dismiss, .celebration button').first().click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(800);

await page.locator('.delib-nav__item--results').click();
await page.waitForSelector('.board__plot', { timeout: 20_000 });
// A field with no points on it is not a picture of anything
await page.waitForSelector('.board__point', { timeout: 20_000 });
await page.waitForTimeout(1200);

// 1. as it lands — the help opens itself on the first visit of a session
await page.locator('.board__map').screenshot({ path: `${SHOTS}/01-help-open.png` });

// 2. help dismissed: the map with nothing on it but the map
await page.locator('.board__help').click();
await page.waitForTimeout(600);
await page.locator('.board__map').screenshot({ path: `${SHOTS}/02-map.png` });

// 3. a point pressed — the callout on the field
const points = page.locator('.board__point');
const count = await points.count();
console.log('   points on the field:', count);
if (count > 0) {
	await points.nth(Math.min(1, count - 1)).click();
	await page.waitForTimeout(700);
	await page.locator('.board__map').screenshot({ path: `${SHOTS}/03-callout.png` });
}

// 4. the whole screen, the way a student meets it on a phone
await page.screenshot({ path: `${SHOTS}/04-screen.png` });

// 5. the field alone, top to bottom. The deliberation tab's two fixed bars sit
// over the bottom of the plot — which is precisely the against half, the half
// the red is in — so they come off for this one shot.
const hideDock = await page.addStyleTag({
	content: '.proposal-dock, .delib-nav { display: none !important; }',
});
await page.waitForTimeout(400);
await page.locator('.board__plot-frame').screenshot({ path: `${SHOTS}/05-field.png` });
await hideDock.evaluate((node: Element) => node.remove());

/**
 * The contrast gauntlet cannot reach this screen — it lives behind a session,
 * a camp and a proposal — and the map is the one surface in the game whose
 * background is a GRADIENT, so it is exactly where a token defined against
 * white goes wrong. Measure what actually rendered, here, while we are stood
 * on it.
 */
const { auditPage, triage } = await import('./contrast-audit.mjs');
// triage(), not the raw result: the violet dock and nav below the map are on
// the accepted ledger already, and a helper that re-reports known debt every
// run is a helper nobody reads
const audit = triage(await auditPage(page, { label: 'class map' }));
if (audit.failures.length === 0) {
	console.log('   ✓ contrast: nothing on the map fails AA');
} else {
	console.log(`   ✗ contrast: ${audit.failures.length} failing run(s) on the map`);
	for (const failure of audit.failures) {
		console.log(`      ${failure.ratio}:1 (needs ${failure.needs}) ${failure.selector}`);
	}
}

await browser.close();
console.log('   ✓', SHOTS);
