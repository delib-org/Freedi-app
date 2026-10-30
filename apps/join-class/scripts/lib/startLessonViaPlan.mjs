// The e2e scripts used to make a lesson with "+ שיעור חדש" on the teacher home. Lessons now
// come from a game of a lesson plan (docs/ia/join-class-lesson-plan.md), so every script that
// needs a lesson goes through here: through the real UI it makes a plan (and its first game),
// starts a lesson from that game with "בלי כיתה" (or with `classId`), and ends on the new
// lesson's "plan the questions" screen, `/t/<mainId>/plan`, where the old scripts carried on.
//
//   const { mainId, classCode, planId, gameId } = await startLessonViaPlan(page, BASE, { title });
//
// The page must already be signed in as the teacher. Options:
//   title     the plan's (and so the game's and the lesson's) name
//   classId   an `agoraClasses` id the teacher teaches; default: no class
//   challenge text of the game's Proposals question (default: none). A lesson cannot leave Waiting
//             without one (Trello Btz5wh4a), so scripts that move the lesson along pass it
//   goto      open `/t` first (default true; pass false when the page is already on the home)
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PROJECT_ID } from '../e2e-env.mjs';

const TIMEOUT = 20000;
const POLL_MS = 250;

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

async function classCodeOf(mainId) {
	const end = Date.now() + TIMEOUT;
	while (Date.now() < end) {
		const code = (await db.doc(`statements/${mainId}`).get()).data()?.statementSettings?.classCode;
		if (code) return code;
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	throw new Error(`lesson ${mainId} has no class code`);
}

export async function startLessonViaPlan(page, baseUrl, { title, classId = null, challenge = '', goto = true } = {}) {
	if (goto) await page.goto(`${baseUrl}/t`, { waitUntil: 'domcontentloaded' });
	// a teacher with plans already sees the "+" button first; a first-time teacher has the form open
	await page.waitForSelector('#teacher-new-title, .teacher-home__new', { timeout: TIMEOUT });
	if ((await page.locator('#teacher-new-title').count()) === 0) await page.click('.teacher-home__new');
	await page.waitForSelector('#teacher-new-title', { timeout: TIMEOUT });
	await page.fill('#teacher-new-title', title);
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/plans\/[^/]+\/games\/[^/]+$/, { timeout: TIMEOUT });
	const parts = new URL(page.url()).pathname.split('/');
	const planId = parts[3];
	const gameId = parts[5];

	if (challenge) {
		await page.waitForSelector('.plan-card__text--challenge', { timeout: TIMEOUT });
		const field = page.locator('.plan-card__text--challenge');
		await field.fill(challenge);
		await field.blur();
		await page.waitForSelector('.plan-card__text--challenge', { timeout: TIMEOUT });
		await page.waitForFunction(
			() => document.querySelector('.plan-card__text--challenge')?.disabled === false,
			null,
			{ timeout: TIMEOUT },
		);
	}
	await page.waitForSelector('[data-action="new-lesson"]', { timeout: TIMEOUT });
	await page.click('[data-action="new-lesson"]');
	await page.waitForSelector('.class-form [data-action="start-lesson"]', { timeout: TIMEOUT });
	const choice = classId ?? '__none';
	if ((await page.locator('.class-form [data-class]').count()) > 0 || classId) {
		await page.waitForSelector(`.class-form [data-class="${choice}"]`, { timeout: TIMEOUT });
		await page.check(`.class-form [data-class="${choice}"]`);
	}
	await page.click('.class-form [data-action="start-lesson"]');
	await page.waitForURL((u) => /^\/t\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith('/t/plans'), {
		timeout: TIMEOUT * 2,
	});
	const mainId = new URL(page.url()).pathname.split('/')[2];
	const classCode = await classCodeOf(mainId);

	// stay in the app: the lesson's "opened" marker is re-written a few seconds after the server's
	// own subscription lands, and a reload would drop that timer
	await page.waitForSelector('.console__link[href$="/plan"]', { timeout: TIMEOUT });
	await page.click('.console__link[href$="/plan"]');
	await page.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });

	return { mainId, classCode, planId, gameId };
}
