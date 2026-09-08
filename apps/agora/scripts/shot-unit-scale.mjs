/* Screenshot the needs round's 0…1 scale, in the three states that matter:
 * nothing answered, one step focused, one step answered.
 *
 *   bash ../../scripts/solo.sh npx tsx scripts/shot-unit-scale.mjs [--tag=before] [--lang=he]
 *
 * Shots land in fastlane-shots/. Temporary tooling for the scale redesign.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { preflight } from './lib/preflight.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement } = require('../src/lib/statementDocs');

const arg = (name, fallback) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));

	return hit ? hit.slice(hit.indexOf('=') + 1) : fallback;
};
const TAG = arg('tag', 'before');
const LANG = arg('lang', 'he');

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const plan = stagePlanPreset('wizcol');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 4,
	proposals: 0,
	quiet: true,
	quick: {
		title: 'הדרך לבית הספר',
		mainQuestion: 'איך הופכים את הדרך לבית הספר לבטוחה?',
		explanation: 'פתרון שכולנו חיים איתו.',
	},
	stagePlan: plan,
});
const { sessionId, bots, teacherToken, joinUrl } = game;

const session = async () =>
	(await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();

// Straight to the needs round (index 2 on the wizcol plan)
await callable('agoraAdvanceStage', { sessionId, toIndex: 2 }, teacherToken);
const s = await session();
const needsItem = s.stagePlan[2];

const NEEDS = [
	'שהילדים יגיעו בבטחה, בלי שאף אחד יפחד לחצות.',
	'לא לאחר לכיתה בגלל שהאוטובוס עוצר רחוק.',
	'מדרכות שאפשר ללכת עליהן, גם עם עגלה.',
	'שההורים יוכלו להוריד אותנו בלי לחסום את הרחוב.',
];
const needIds = [];
for (const [index, bot] of bots.entries()) {
	const statementId = `${sessionId}--${bot.uid}--${needsItem.itemId}`;
	await db
		.collection(Collections.statements)
		.doc(statementId)
		.set(
			buildAnswerStatement(
				s,
				needsItem.statementId,
				statementId,
				bot.uid,
				bot.anonName,
				NEEDS[index],
			),
		);
	needIds.push(statementId);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.addInitScript((lang) => window.localStorage.setItem('agora_lang', lang), LANG);
page.on('pageerror', (error) => console.log('[PAGEERROR]', error.message.slice(0, 300)));

mkdirSync('fastlane-shots', { recursive: true });

await page.goto(joinUrl, { waitUntil: 'domcontentloaded' });
const nameDoor = page.locator('input.join__name-input');
if (await nameDoor.waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false)) {
	await page.locator('button.btn--ghost').first().click();
}

await page.waitForSelector('.round__ask', { timeout: 30_000 });
// My own text first — the classmates' side is gated on it
await page.locator('textarea.round__textarea').fill('שנוכל ללכת לבד לבית הספר בלי לפחד.');
await page.locator('.round__mine button.btn--primary').click();
await page.waitForSelector('.round__list .unit-scale', { timeout: 30_000 });
await page.waitForTimeout(900);

const shot = async (name) => {
	const path = `fastlane-shots/${TAG}-${name}.png`;
	await page.screenshot({ path, fullPage: false });
	console.log(`   shot ${path}`);
};

// 1. Nothing answered — scroll the classmates' list into view
await page.locator('.round__list .unit-scale').first().evaluate((el) =>
	el.scrollIntoView({ block: 'center' }),
);
await page.waitForTimeout(400);
await shot('unrated');

// 2. Focused / hovered on the middle step of the first card
const firstScale = page.locator('.round__list .unit-scale').first();
await firstScale.locator('[role="radio"]').nth(2).hover();
await page.waitForTimeout(300);
await shot('hover');

// 3. Answered: the first card gets "מאוד", the second "בכלל לא"
await firstScale.locator('[role="radio"]').nth(3).click();
await page.waitForTimeout(1400);
await page.locator('.round__list .unit-scale').nth(1).locator('[role="radio"]').nth(0).click();
await page.waitForTimeout(1600);
await page.locator('.round__list .unit-scale').first().evaluate((el) =>
	el.scrollIntoView({ block: 'center' }),
);
await page.waitForTimeout(400);
await shot('rated');

// 4. The whole list, full page — the scanning view
await page.screenshot({ path: `fastlane-shots/${TAG}-full.png`, fullPage: true });
console.log(`   shot fastlane-shots/${TAG}-full.png`);

console.log(`\n   session ${sessionId}   student ${joinUrl}\n`);
await browser.close();
process.exit(0);
