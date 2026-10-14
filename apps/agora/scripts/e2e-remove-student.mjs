/* The teacher removes a student, end to end.
 *
 * Eight bots at the square (lottery on: more than six students) plus one
 * student in a real browser who typed "Prank Star" at the door. The teacher,
 * on their own screen, opens the Class panel, presses Remove on that row and
 * confirms in the app's own question. Then:
 *
 *  - Firestore: the seat, the dealt hand and the real name are gone; the uid
 *    is on the session's `removedUids`; the stage did not move; the student
 *    count dropped by one.
 *  - The student's phone: the calm "your teacher removed you" screen, which a
 *    reload keeps, and the join door says the same instead of a new seat.
 *  - A bot removed through the callable: its note stays on the board, and the
 *    rules refuse its next note, rating and vote; the join callable refuses
 *    it; the lottery refuses to deal to it and still deals to classmates.
 *  - A classmate cannot remove anyone.
 *
 * Run against an emulator suite with vite up, e.g.
 *   npm run solo -- npx tsx apps/agora/scripts/e2e-remove-student.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, FIRESTORE_REST, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, createAgoraParticipantId } = require('@freedi/shared-types');

await preflight();

const OUT = 'output/remove-student';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `rm-${Date.now().toString(36)}`;
const PRANK_NAME = 'Prank Star';

async function waitFor(label, probe, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: not observed within ${timeoutMs}ms`);
		await pause(400);
	}
}

/** A rules-enforced create under a real token; returns the HTTP status */
async function restCreate(token, collection, documentId, data) {
	const fields = {};
	for (const [key, value] of Object.entries(data)) {
		fields[key] =
			typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) };
	}
	const response = await fetch(
		`${FIRESTORE_REST}/${collection}?documentId=${encodeURIComponent(documentId)}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ fields }),
		},
	);

	return response.status;
}

const sessionDoc = async (sessionId) => (await db.collection('agoraSessions').doc(sessionId).get()).data();
const seatCount = async (sessionId) =>
	(await db.collection('agoraParticipants').where('sessionId', '==', sessionId).get()).docs.filter(
		(snap) => !snap.data().isAI,
	).length;

step('a lesson at the square: eight bots with real names, the lottery on');
const teacher = await signInTeacher(`${runId}-teacher`);
const game = await fastlane({
	stage: AgoraStage.deliberation,
	students: 8,
	proposals: 7,
	ratings: false,
	quiet: true,
	runId,
	teacher,
	realNames: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'],
});
const { sessionId, code, bots } = game;
const parentId = (await sessionDoc(sessionId)).challengeQuestionId;
console.log(`   session ${sessionId} (code ${code})`);

const browser = await chromium.launch({ headless: true });

try {
	step('a ninth student joins in a browser as "Prank Star"');
	const student = await mkPage(browser, 'student', { width: 390, height: 844 });
	await student.goto(`${VITE_HOST}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(student, PRANK_NAME);
	await student.waitForURL(/#!\/play\//, { timeout: 60_000 });
	const prank = await waitFor('the prank identity', async () => {
		const rows = await db
			.collection('agoraIdentities')
			.where('sessionId', '==', sessionId)
			.where('realName', '==', PRANK_NAME)
			.get();

		return rows.docs[0]?.data();
	});
	const prankSeat = createAgoraParticipantId(sessionId, prank.userId);
	eq('nine students seated', await seatCount(sessionId), 9);
	// Their hand, so its deletion can be watched (dealt server-side, like the client does)
	await db.collection('agoraHands').doc(`${sessionId}--${prank.userId}`).set({
		sessionId,
		userId: prank.userId,
		hands: { [parentId]: [bots[0].proposalId] },
		lastUpdate: Date.now(),
	});
	const stageBefore = (await sessionDoc(sessionId)).stageIndex;

	step('the teacher, on their own screen, opens the Class panel');
	const desk = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await desk.addInitScript(() => localStorage.setItem('agora.teacher.device', 'private'));
	await desk.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	// The dev sign-in can lose its first race with auth start-up; e2e-class-view retries the same way
	for (let attempt = 0; attempt < 3; attempt++) {
		await desk.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		const signedIn = await desk
			.waitForSelector('.teacher-nav__title', { timeout: 15_000 })
			.then(() => true, () => false);
		if (signedIn) break;
		if (attempt === 2) fail('teacher sign-in never took');
	}
	await desk.goto(`${VITE_HOST}/#!/teach/session/${sessionId}`, { waitUntil: 'domcontentloaded' });
	await desk.locator('.teacher-panels__chip[aria-controls="teacher-panel-class"]').click();
	const panel = desk.locator('#teacher-panel-class');
	await expect(panel).toContainText(PRANK_NAME, { timeout: 20_000 });
	const row = panel.locator('.class-panel__item', { hasText: PRANK_NAME });

	step('Remove asks first, in the app; "No, keep" changes nothing');
	await row.locator('.class-panel__remove').click();
	await expect(row.locator('.class-panel__confirm')).toBeVisible();
	await shot(desk, 'teacher-confirm');
	await row.locator('.class-panel__confirm .btn--secondary').click();
	await expect(row.locator('.class-panel__confirm')).toHaveCount(0);
	eq('still nine after "keep"', await seatCount(sessionId), 9);

	step('Remove → confirm: the seat goes, the uid is blocked');
	await row.locator('.class-panel__remove').click();
	await row.locator('.class-panel__remove-ok').click();
	await waitFor('the seat to be deleted', async () => !(await db.collection('agoraParticipants').doc(prankSeat).get()).exists);
	const afterSession = await sessionDoc(sessionId);
	eq('uid on the block list', typeof afterSession.removedUids?.[prank.userId], 'number');
	eq('the stage did not move', afterSession.stageIndex, stageBefore);
	eq('eight students left', await seatCount(sessionId), 8);
	eq('the hand is gone', (await db.collection('agoraHands').doc(`${sessionId}--${prank.userId}`).get()).exists, false);
	eq('the real name is gone', (await db.collection('agoraIdentities').doc(`${sessionId}--${prank.userId}`).get()).exists, false);
	await expect(panel.locator('.class-panel__status')).toBeVisible();
	await expect(panel.locator('.class-panel__item', { hasText: PRANK_NAME })).toHaveCount(0);
	await shot(desk, 'teacher-after');

	step("the student's phone says so, calmly — and keeps saying so");
	await expect(student.locator('.game-removed h2')).toBeVisible({ timeout: 20_000 });
	await shot(student, 'student-removed');
	await student.reload({ waitUntil: 'domcontentloaded' });
	await expect(student.locator('.game-removed h2')).toBeVisible({ timeout: 30_000 });
	await student.goto(`${VITE_HOST}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await expect(student.locator('p.join__error')).toBeVisible({ timeout: 30_000 });
	eq('the door did not hand back a seat', (await db.collection('agoraParticipants').doc(prankSeat).get()).exists, false);
	await shot(student, 'student-door');

	step('a bot removed through the callable: rules and callables keep it out');
	const [writer, rater] = bots.filter((bot) => bot.proposalId);
	const removed = await callable(
		'agoraRemoveParticipant',
		{ sessionId, studentUid: writer.uid },
		teacher.idToken,
	);
	eq('removed', removed.removed, true);
	const again = await callable('agoraRemoveParticipant', { sessionId, studentUid: writer.uid }, teacher.idToken);
	eq('repeat-safe', again.removed, false);
	const note = (await db.collection('statements').doc(writer.proposalId).get()).data();
	eq('their note stays on the board', typeof note?.statement === 'string' && note.statement.length > 0, true);

	eq(
		'a new note is refused',
		await restCreate(writer.idToken, 'statements', `${runId}-late-note`, {
			statementId: `${runId}-late-note`,
			statement: 'still here',
			creatorId: writer.uid,
			parentId,
			agoraSessionId: sessionId,
			statementType: 'option',
		}),
		403,
	);
	eq(
		'a rating is refused',
		await restCreate(writer.idToken, 'evaluations', `${writer.uid}--${rater.proposalId}`, {
			evaluationId: `${writer.uid}--${rater.proposalId}`,
			parentId,
			statementId: rater.proposalId,
			evaluatorId: writer.uid,
			evaluation: 1,
			updatedAt: Date.now(),
			agoraSessionId: sessionId,
		}),
		403,
	);
	eq(
		'a vote is refused',
		await restCreate(writer.idToken, 'votes', `${writer.uid}--${parentId}`, {
			voteId: `${writer.uid}--${parentId}`,
			statementId: rater.proposalId,
			userId: writer.uid,
			parentId,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		}),
		403,
	);
	eq(
		'a classmate still rates',
		await restCreate(rater.idToken, 'evaluations', `${rater.uid}--${writer.proposalId}`, {
			evaluationId: `${rater.uid}--${writer.proposalId}`,
			parentId,
			statementId: writer.proposalId,
			evaluatorId: rater.uid,
			evaluation: 1,
			updatedAt: Date.now(),
			agoraSessionId: sessionId,
		}),
		200,
	);

	const rejoin = await callable('agoraJoinSession', { code }, writer.idToken).then(
		() => 'joined',
		(error) => String(error),
	);
	eq('the join callable refuses them', /removed-from-session/.test(rejoin), true);
	const dealt = await callable('agoraDealNotes', { sessionId, parentId, mode: 'fill' }, writer.idToken).then(
		() => 'dealt',
		(error) => String(error),
	);
	eq('no hand for them', /PERMISSION_DENIED/.test(dealt), true);
	const classmateDeal = await callable('agoraDealNotes', { sessionId, parentId, mode: 'fill' }, rater.idToken);
	eq('a classmate is still dealt a hand', Array.isArray(classmateDeal.hand) && classmateDeal.hand.length > 0, true);
	eq('the lottery is still on with seven students', classmateDeal.active, true);

	const sneaky = await callable('agoraRemoveParticipant', { sessionId, studentUid: rater.uid }, bots[2].idToken).then(
		() => 'removed',
		(error) => String(error),
	);
	eq('a student cannot remove anyone', /PERMISSION_DENIED|permission/i.test(sneaky), true);
	eq('seven students left', await seatCount(sessionId), 7);

	console.log('\nALL PASS');
} finally {
	await browser.close();
}
