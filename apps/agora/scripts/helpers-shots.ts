/* Screenshots of the end-of-lesson recap and its two halves.
 *
 *   npx tsx scripts/helpers-shots.ts
 *   AGORA_LANG=en npx tsx scripts/helpers-shots.ts
 *
 * Lands a real student on the recap with a class that has already rated AND
 * already thanked each other, so both halves of the switch have something in
 * them — an empty helpers board proves nothing about a helpers board.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AgoraSession, Evaluation } from '@freedi/shared-types';
import { FIRESTORE_HOST, FUNCTIONS_BASE, preflight } from './lib/preflight.mjs';
import { fastlane, positionStudent, proposeAs } from './lib/fastlane';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections } = require(
	'@freedi/shared-types',
) as typeof import('@freedi/shared-types');
const { agoraCreator } = require(
	'../src/lib/statementDocs',
) as typeof import('../src/lib/statementDocs');

const LANG = process.env.AGORA_LANG ?? 'he';
const SHOTS = 'helpers-shots';

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'], autoSeed: true });
const result = await fastlane({ stage: AgoraStage.deliberation, students: 9, proposals: 5 });
console.log('   session', result.sessionId, 'code', result.code);

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'freedi-test' }));
const session = (
	await db.collection(Collections.agoraSessions).doc(result.sessionId).get()
).data() as AgoraSession;

const SHAPES: ReadonlyArray<(camp: string) => number> = [
	() => 1,
	(camp) => (camp === 'left' ? 1 : camp === 'right' ? -0.5 : 0.5),
	(camp) => (camp === 'right' ? 1 : camp === 'left' ? -1 : 0),
	() => -0.5,
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
console.log(`   ✓ ${scored}/${rated.length} proposals scored by the class`);

/* Thank-yous, in a SHAPE: a clear top, a tie under it, and a tail on zero —
 * the three cases the board's ranking has to get right. */
const THANKS = [4, 3, 3, 2, 1, 1, 0, 0, 0];
for (const [index, bot] of result.bots.entries()) {
	const helping = THANKS[index % THANKS.length];
	await db
		.collection(Collections.agoraParticipants)
		.doc(bot.participantId)
		.update({ 'points.helping': helping, 'points.total': helping * 2 + 3 });
}
console.log('   ✓ thank-yous spread over the class');

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
	'input.camp-scale__slider, .chat-log, .delib-hud',
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
await page.waitForSelector('.chat-log, .delib-hud', { timeout: 40_000 });
await db
	.collection(Collections.agoraParticipants)
	.doc(`${result.sessionId}--${uid}`)
	.update({ 'points.helping': 2, 'points.total': 11 });
await page.waitForTimeout(2500);
await page
	.locator('.celebration__dismiss, .celebration button')
	.first()
	.click({ timeout: 4000 })
	.catch(() => {});

// The teacher ends the lesson: the class score is computed server-side
const response = await fetch(`${FUNCTIONS_BASE}/agoraAdvanceStage`, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${result.teacherToken}`,
	},
	body: JSON.stringify({ data: { sessionId: result.sessionId, stage: AgoraStage.results } }),
	signal: AbortSignal.timeout(120_000),
});
console.log('   advanceStage →', response.status, (await response.text()).slice(0, 200));

await page.waitForSelector('.results__switch', { timeout: 60_000 });
await page.waitForTimeout(2000);

// 1. the recap as it lands — the class half, with the switch above it
await page.screenshot({ path: `${SHOTS}/01-class.png` });

// The map's help opens itself the first time the board is shown in a session,
// and its scrim is a full-viewport modal — so it swallows the first press
// anywhere on the recap, the switch included. One tap, the same as a student's.
await page
	.locator('.board__help-scrim')
	.click({ timeout: 3000 })
	.catch(() => {});
await page.waitForTimeout(400);

// 2. the helpers half
await page.locator('.results__switch-btn').nth(1).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${SHOTS}/02-helpers.png` });
await page.locator('.helpers-board').screenshot({ path: `${SHOTS}/03-helpers-board.png` });

const { auditPage, triage } = await import('./contrast-audit.mjs');
const audit = triage(await auditPage(page, { label: 'helpers board' }));
if (audit.failures.length === 0) {
	console.log('   ✓ contrast: nothing on the helpers board fails AA');
} else {
	console.log(`   ✗ contrast: ${audit.failures.length} failing run(s)`);
	for (const failure of audit.failures) {
		console.log(`      ${failure.ratio}:1 (needs ${failure.needs}) ${failure.selector}`);
	}
}

await browser.close();
console.log('   ✓', SHOTS);
