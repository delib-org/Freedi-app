/* Late arrival: join after two rounds closed, write and rate in both views,
 * keep catching up across a teacher advance, and preserve the carried record.
 * Run: npx tsx scripts/e2e-late-join.mjs (emulators + vite).
 */
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { preflight } from './lib/preflight.mjs';
import { passNameDoor, step } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement } = require('../src/lib/statementDocs');
await preflight();

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
	for (const world of ['classic', 'village']) {
		step(`${world}: classmates finish stories and needs before the student joins`);
		const plan = stagePlanPreset('wizcol');
		plan.splice(3, 0, { itemId: 'open-question', stage: 'question', title: 'What should change?' });
		const game = await fastlane({
			stage: 'lobby', students: 2, proposals: 0, quiet: true,
			quick: { title: 'Late arrival', mainQuestion: 'How can we improve our school?' },
			stagePlan: plan,
		});
		const ref = db.collection('agoraSessions').doc(game.sessionId);
		const session = async () => (await ref.get()).data();
		const advance = (toIndex) => callable('agoraAdvanceStage', { sessionId: game.sessionId, toIndex }, game.teacherToken);
		await ref.update({ world, status: 'live' });
		for (const index of [1, 2]) {
			await advance(index);
			const room = await session();
			const item = room.stagePlan[index];
			const bot = game.bots[0];
			const id = `${game.sessionId}--${bot.uid}--${item.itemId}`;
			await db.collection('statements').doc(id).set(
				buildAnswerStatement(room, item.statementId, id, bot.uid, bot.anonName, `Classmate ${item.itemId}`),
			);
		}
		await advance(3);
		const originalOutcome = (await session()).stageState['round-story'].outcome;
		expect(originalOutcome.selected).toHaveLength(1);

		const context = await browser.newContext({ reducedMotion: 'reduce' });
		const page = await context.newPage();
		await page.addInitScript(() => localStorage.setItem('agora_village_lite', '1'));
		await page.goto(game.joinUrl);
		await passNameDoor(page, 'Late student');
		await expect(page.locator('.stage-nav')).toBeVisible({ timeout: 30000 });
		await expect.poll(() => page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid)).toBeTruthy();
		const uid = await page.evaluate(() => window.__agoraDebug().user.user.uid);
		await expect.poll(async () => (await db.collection('agoraParticipants').doc(`${game.sessionId}--${uid}`).get()).exists).toBe(true);

		const choose = async (index) => {
			await page.locator('.stage-nav__station').nth(index).click();
			if (world === 'village') await page.locator('.place-bar__item[data-place="note"]').click();
		};
		await choose(1);
		const story = page.locator('.round--story .round__textarea');
		await expect(story).toBeVisible({ timeout: 30000 });
		await story.fill('My late story');

		step(`${world}: a teacher advance leaves the catch-up station and draft in place`);
		await advance(4);
		await expect(page.locator('.stage-nav__station').nth(4)).toHaveClass(/stage-nav__station--current/);
		await expect(story).toHaveValue('My late story');
		await page.locator('.round__mine button.btn--primary').click();
		const answerId = `${game.sessionId}--${uid}--round-story`;
		await expect.poll(async () => (await db.collection('statements').doc(answerId).get()).data()?.statement).toBe('My late story');

		step(`${world}: rate a classmate at the earlier story station`);
		if (world === 'village') {
			await page.locator('.place-bar__item[data-place="board"]').click();
			await page.locator('.village-note__rate .like-button').first().click();
		} else {
			await page.locator('.round__others .like-button').first().click();
		}
		const peerId = `${game.sessionId}--${game.bots[0].uid}--round-story`;
		await expect.poll(async () => (await db.collection('evaluations').doc(`${uid}--${peerId}`).get()).data()?.evaluation).toBe(1);
		expect((await session()).stageState['round-story'].outcome).toEqual(originalOutcome);

		step(`${world}: catch up on needs and an ordinary question without mixing answers`);
		await choose(2);
		const needs = page.locator('.round--needs .round__textarea');
		await expect(needs).toHaveValue('');
		await needs.fill('My late need');
		await page.locator('.round__mine button.btn--primary').click();
		await expect.poll(async () => (await db.collection('statements').doc(`${game.sessionId}--${uid}--round-needs`).get()).data()?.statement).toBe('My late need');
		await choose(3);
		const question = page.locator('.question__textarea');
		await expect(question).toHaveValue('');
		await question.fill('My late answer');
		await page.locator('.question__mine button.btn--primary').click();
		await expect.poll(async () => (await db.collection('statements').doc(`${game.sessionId}--${uid}--open-question`).get()).data()?.statement).toBe('My late answer');
		await page.reload();
		await expect(page.locator('.stage-nav__station[aria-current="step"]')).toHaveAttribute('title', 'What should change?', { timeout: 30000 });
		if (world === 'village') await page.locator('.place-bar__item[data-place="note"]').click();
		await expect(question).toHaveValue('My late answer');
		await context.close();
	}
} finally {
	await browser.close();
}
console.info('✓ late joining and catch-up verified in both views');
