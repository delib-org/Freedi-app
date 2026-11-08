/* The teacher removes a student, end to end.
 *
 * Eight bots at the square (lottery on: more than six students) plus one
 * student in a real browser who typed "Prank Star" at the door. The teacher,
 * on their own screen, opens the Class panel, presses Remove on that row and
 * confirms in the app's own question. Then:
 *
 *  - Firestore: the seat, the dealt hand and the real name are gone; the uid
 *    is on the session's `removedUids` with its pseudonym; the stage did not
 *    move; the student count dropped by one.
 *  - The student's phone: the calm "your teacher removed you" screen, which a
 *    reload keeps. "Ask to come back" → the door → NOT seated, "waiting"
 *    (survives reload); the teacher's card names them → "Not now" → the
 *    screen turns live to "not now"; asking again at once is paused; after
 *    the pause → waiting again → "Let back in" → in the game, same pseudonym,
 *    same points, the stage never moved.
 *  - A bot removed through the callable: its note stays on the board (and the
 *    teacher's take-down still reaches it); the rules refuse its next note,
 *    rating and vote; its knock is one pending request; it cannot approve
 *    itself; the lottery refuses it and still deals to classmates; approved,
 *    it writes again.
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

const docExists = async (collection, id) => (await db.collection(collection).doc(id).get()).exists;
const sessionDoc = async (sessionId) =>
	(await db.collection('agoraSessions').doc(sessionId).get()).data();
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
	await db
		.collection('agoraHands')
		.doc(`${sessionId}--${prank.userId}`)
		.set({
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
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
	// The dev sign-in can lose its first race with auth start-up; e2e-class-view retries the same way
	for (let attempt = 0; attempt < 3; attempt++) {
		await desk.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		const signedIn = await desk.waitForSelector('.teacher-nav__title', { timeout: 15_000 }).then(
			() => true,
			() => false,
		);
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

	step('Remove → confirm: the seat goes, the uid is blocked under its pseudonym');
	const prankBefore = (await db.collection('agoraParticipants').doc(prankSeat).get()).data();
	await row.locator('.class-panel__remove').click();
	await row.locator('.class-panel__remove-ok').click();
	await waitFor(
		'the seat to be deleted',
		async () => !(await db.collection('agoraParticipants').doc(prankSeat).get()).exists,
	);
	const afterSession = await sessionDoc(sessionId);
	eq(
		'the pseudonym is kept on the block list',
		afterSession.removedUids?.[prank.userId]?.anonName,
		prankBefore.anonName,
	);
	eq('the stage did not move', afterSession.stageIndex, stageBefore);
	eq('eight students left', await seatCount(sessionId), 8);
	eq('the hand is gone', await docExists('agoraHands', `${sessionId}--${prank.userId}`), false);
	eq(
		'the real name is gone',
		await docExists('agoraIdentities', `${sessionId}--${prank.userId}`),
		false,
	);
	await expect(panel.locator('.class-panel__status')).toBeVisible();
	await expect(panel.locator('.class-panel__item', { hasText: PRANK_NAME })).toHaveCount(0);
	await shot(desk, 'teacher-after');

	step("the student's phone says so, calmly — and keeps saying so");
	const removedScreen = student.locator('.game-removed');
	await expect(removedScreen).toHaveAttribute('data-state', 'removed', { timeout: 20_000 });
	await shot(student, 'student-removed');
	await student.reload({ waitUntil: 'domcontentloaded' });
	await expect(removedScreen).toHaveAttribute('data-state', 'removed', { timeout: 30_000 });

	const knock = async () => {
		await student.locator('.game-removed__ask').click();
		await passNameDoor(student, PRANK_NAME);
	};

	step('they ask to come back: not seated, waiting — and the teacher sees who');
	await knock();
	await expect(removedScreen).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
	const knocked = (await sessionDoc(sessionId)).removedUids?.[prank.userId];
	eq('the request is stamped', typeof knocked?.requestedAt, 'number');
	eq('no seat while waiting', await docExists('agoraParticipants', prankSeat), false);
	await student.reload({ waitUntil: 'domcontentloaded' });
	await expect(removedScreen).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
	await shot(student, 'student-waiting');
	const request = desk.locator('[data-testid="rejoin-alert"]');
	await expect(request).toContainText(prankBefore.anonName, { timeout: 20_000 });
	await expect(request).toContainText(PRANK_NAME);
	await shot(desk, 'teacher-request');

	step('"Not now": still out, the screen says so live, the typed name is forgotten');
	await request.locator('.rejoin-alert__decline').click();
	await expect(removedScreen).toHaveAttribute('data-state', 'declined', { timeout: 20_000 });
	await expect(request).toHaveCount(0);
	eq('still no seat', await docExists('agoraParticipants', prankSeat), false);
	eq(
		'the name typed with the request is gone',
		await docExists('agoraIdentities', `${sessionId}--${prank.userId}`),
		false,
	);
	await shot(student, 'student-declined');

	step('asking again at once is paused; after the pause the knock lands again');
	await knock();
	await expect(student.locator('p.join__error')).toBeVisible({ timeout: 30_000 });
	eq(
		'no new request inside the pause',
		(await sessionDoc(sessionId)).removedUids[prank.userId].requestedAt,
		knocked.requestedAt,
	);
	// A minute passes — on the server's stamps, which is what the pause reads
	const entry = (await sessionDoc(sessionId)).removedUids[prank.userId];
	await db
		.collection('agoraSessions')
		.doc(sessionId)
		.update({
			[`removedUids.${prank.userId}.declinedAt`]: entry.declinedAt - 61_000,
			[`removedUids.${prank.userId}.requestedAt`]: entry.requestedAt - 61_000,
		});
	await student.goto(`${VITE_HOST}/#!/play/${sessionId}`, { waitUntil: 'domcontentloaded' });
	await expect(removedScreen).toHaveAttribute('data-state', 'declined', { timeout: 30_000 });
	await knock();
	await expect(removedScreen).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
	await expect(request).toContainText(PRANK_NAME, { timeout: 20_000 });

	step('"Let back in": seated again under the OLD pseudonym, in the game');
	await request.locator('.rejoin-alert__approve').click();
	await expect(removedScreen).toHaveCount(0, { timeout: 30_000 });
	const back = await waitFor('the seat to come back', async () =>
		(await db.collection('agoraParticipants').doc(prankSeat).get()).data(),
	);
	eq('same pseudonym', back.anonName, prankBefore.anonName);
	eq('same points', back.points.total, prankBefore.points.total);
	eq('off the block list', (await sessionDoc(sessionId)).removedUids?.[prank.userId], undefined);
	eq('nine students again', await seatCount(sessionId), 9);
	eq('the stage still did not move', (await sessionDoc(sessionId)).stageIndex, stageBefore);
	eq(
		'the name typed at the door is back for the teacher',
		(await db.collection('agoraIdentities').doc(`${sessionId}--${prank.userId}`).get()).data()
			?.realName,
		PRANK_NAME,
	);
	await expect(panel.locator('.class-panel__item', { hasText: PRANK_NAME })).toHaveCount(1, {
		timeout: 20_000,
	});
	await shot(student, 'student-back');
	await shot(desk, 'teacher-back');

	step('a bot removed through the callable: rules and callables keep it out');
	const [writer, rater] = bots.filter((bot) => bot.proposalId);
	const removed = await callable(
		'agoraRemoveParticipant',
		{ sessionId, studentUid: writer.uid },
		teacher.idToken,
	);
	eq('removed', removed.removed, true);
	const again = await callable(
		'agoraRemoveParticipant',
		{ sessionId, studentUid: writer.uid },
		teacher.idToken,
	);
	eq('repeat-safe', again.removed, false);
	const note = (await db.collection('statements').doc(writer.proposalId).get()).data();
	eq(
		'their note stays on the board',
		typeof note?.statement === 'string' && note.statement.length > 0,
		true,
	);

	const rating = (rater_, statementId) => ({
		evaluationId: `${rater_.uid}--${statementId}`,
		parentId,
		statementId,
		evaluatorId: rater_.uid,
		evaluation: 1,
		updatedAt: Date.now(),
		agoraSessionId: sessionId,
	});
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
		await restCreate(
			writer.idToken,
			'evaluations',
			`${writer.uid}--${rater.proposalId}`,
			rating(writer, rater.proposalId),
		),
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
		await restCreate(
			rater.idToken,
			'evaluations',
			`${rater.uid}--${writer.proposalId}`,
			rating(rater, writer.proposalId),
		),
		200,
	);

	const first = await callable('agoraJoinSession', { code }, writer.idToken);
	eq('the door is a knock, not a seat', first.waiting, true);
	eq('…under the old pseudonym', first.anonName, writer.anonName);
	const stamp = (await sessionDoc(sessionId)).removedUids[writer.uid].requestedAt;
	await callable('agoraJoinSession', { code }, writer.idToken);
	eq(
		'one pending request per uid',
		(await sessionDoc(sessionId)).removedUids[writer.uid].requestedAt,
		stamp,
	);
	eq(
		'no seat from knocking',
		await docExists('agoraParticipants', `${sessionId}--${writer.uid}`),
		false,
	);
	eq(
		'a waiting student still writes nothing',
		await restCreate(
			writer.idToken,
			'evaluations',
			`${writer.uid}--${rater.proposalId}`,
			rating(writer, rater.proposalId),
		),
		403,
	);
	const selfApprove = await callable(
		'agoraResolveRejoin',
		{ sessionId, studentUid: writer.uid, decision: 'approve' },
		writer.idToken,
	).then(
		() => 'approved',
		(error) => String(error),
	);
	eq('a student cannot let themselves back', /PERMISSION_DENIED/.test(selfApprove), true);

	const dealt = await callable(
		'agoraDealNotes',
		{ sessionId, parentId, mode: 'fill' },
		writer.idToken,
	).then(
		() => 'dealt',
		(error) => String(error),
	);
	eq('no hand for them', /PERMISSION_DENIED/.test(dealt), true);
	const classmateDeal = await callable(
		'agoraDealNotes',
		{ sessionId, parentId, mode: 'fill' },
		rater.idToken,
	);
	eq(
		'a classmate is still dealt a hand',
		Array.isArray(classmateDeal.hand) && classmateDeal.hand.length > 0,
		true,
	);
	eq('the lottery is still on with eight students', classmateDeal.active, true);

	const sneaky = await callable(
		'agoraRemoveParticipant',
		{ sessionId, studentUid: rater.uid },
		bots[2].idToken,
	).then(
		() => 'removed',
		(error) => String(error),
	);
	eq('a student cannot remove anyone', /PERMISSION_DENIED|permission/i.test(sneaky), true);
	eq('eight students left', await seatCount(sessionId), 8);

	step("the teacher's take-down still reaches a removed student's note");
	const hidden = await callable(
		'agoraModerateStatement',
		{ sessionId, action: 'hide', statementId: writer.proposalId, reason: 'test' },
		teacher.idToken,
	);
	eq('hidden', hidden.hidden, true);
	eq(
		'the note is down',
		(await db.collection('statements').doc(writer.proposalId).get()).data()?.hide,
		true,
	);
	await callable(
		'agoraModerateStatement',
		{ sessionId, action: 'restore', statementId: writer.proposalId },
		teacher.idToken,
	);
	await desk.locator('.teacher-panels__chip[aria-controls="teacher-panel-texts"]').click();
	await expect(desk.locator('#teacher-panel-texts')).toContainText(writer.anonName, {
		timeout: 20_000,
	});
	await shot(desk, 'teacher-texts-removed-author');

	step('approved through the callable, the bot writes again');
	await callable(
		'agoraResolveRejoin',
		{ sessionId, studentUid: writer.uid, decision: 'approve' },
		teacher.idToken,
	);
	eq(
		'seated under the old pseudonym',
		(await db.collection('agoraParticipants').doc(`${sessionId}--${writer.uid}`).get()).data()
			?.anonName,
		writer.anonName,
	);
	eq(
		'a rating lands again',
		await restCreate(
			writer.idToken,
			'evaluations',
			`${writer.uid}--${rater.proposalId}`,
			rating(writer, rater.proposalId),
		),
		200,
	);
	eq('nine students again', await seatCount(sessionId), 9);

	console.log('\nALL PASS');
} finally {
	await browser.close();
}
