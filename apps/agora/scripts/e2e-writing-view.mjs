/* The teacher's "what they wrote" screen, end to end, at a phone's width.
 *
 * Four bot students write at the square; a fifth ("Prank Star") is a real
 * browser student with two lines. The teacher, on a 390px screen:
 *   - sees the BY STUDENT list and the BY QUESTION lens
 *   - hides a line with a reason  -> the author's thread holds the notice; restore puts it back
 *   - rewords a line              -> the author gets the (default) notice with the old words
 *   - deletes a line for good     -> the text is gone everywhere, no restore, still a notice
 *   - removes Prank, writes a note about his line from the list (removed students are
 *     listed muted and still reachable), he knocks, the teacher lets him back,
 *     and the note is waiting in his thread
 *
 * Asserts Firestore state AND the pixels that matter. BEFORE=1 only takes the
 * "before" screenshots (run it against the old panel).
 *
 * Run: bash <solo-ports> npx tsx scripts/e2e-writing-view.mjs  (needs emulators + vite)
 */
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, proposeAs, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, createAgoraParticipantId } = require('@freedi/shared-types');

await preflight();

const OUT = 'output/writing-view';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const BEFORE = process.env.BEFORE === '1';
const runId = `wv-${Date.now().toString(36)}`;
const PRANK_NAME = 'Prank Star';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, probe, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: not observed within ${timeoutMs}ms`);
		await pause(400);
	}
}

const statementOf = async (id) => (await db.collection('statements').doc(id).get()).data();
const threadOf = async (sessionId, uid) =>
	(
		await db
			.collection('agoraTeacherMessages')
			.where('sessionId', '==', sessionId)
			.where('studentUid', '==', uid)
			.get()
	).docs
		.map((snap) => snap.data())
		.sort((a, b) => a.createdAt - b.createdAt);

/** The student opens the private thread with the teacher and finds a line */
async function readThread(page, text, shotName) {
	await clearCelebration(page, 'student');
	await page.getByRole('button', { name: 'הודעה מהמורה' }).first().click();
	const sheet = page.locator('.teacher-thread');
	await expect(sheet).toContainText(text, { timeout: 20_000 });
	await shot(page, shotName);
	await sheet.locator('.look-sheet__head button').click();
	await expect(sheet).toHaveCount(0);
}

step('a lesson at the square: four bots with real names, each with a proposal');
const teacher = await signInTeacher(`${runId}-teacher`);
const game = await fastlane({
	stage: AgoraStage.deliberation,
	students: 4,
	proposals: 4,
	ratings: true,
	quiet: true,
	runId,
	teacher,
	realNames: ['דנה כהן', 'עומר לוי', 'מיכל בר', 'נועם אבן'],
});
const { sessionId, code, bots } = game;
const parentId = (await db.collection('agoraSessions').doc(sessionId).get()).data()
	.challengeQuestionId;
const [botA, botB, botC] = bots;
console.log(`   session ${sessionId} (code ${code})`);

const browser = await chromium.launch({ headless: true });

try {
	step('Prank Star joins in a browser and gets two lines on the board');
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
	const lineOne = await proposeAs(sessionId, prank.userId, 'אפשר לבנות גינה משותפת ליד בית הספר');
	const base = await statementOf(lineOne);
	const lineTwo = `${lineOne}-b`;
	await db
		.collection('statements')
		.doc(lineTwo)
		.set({
			...base,
			statementId: lineTwo,
			statement: 'השכנים צריכים לדבר יותר אחד עם השני',
			createdAt: base.createdAt + 5_000,
			lastUpdate: base.lastUpdate + 5_000,
		});

	const desk = await mkPage(browser, 'teacher', { width: 390, height: 844 });
	await desk.addInitScript(() => localStorage.setItem('agora.teacher.device', 'private'));
	await desk.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await desk.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
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
	const textsChip = desk.locator('.teacher-panels__chip[aria-controls="teacher-panel-texts"]');
	await textsChip.click();
	const panel = desk.locator('#teacher-panel-texts');
	await expect(panel).toBeVisible({ timeout: 20_000 });
	await pause(1200);
	await shot(desk, BEFORE ? 'before-list' : 'after-1-by-question');
	if (BEFORE) {
		console.log('BEFORE shots taken');
		process.exitCode = 0;
		await browser.close();
		process.exit(0);
	}

	step('BY STUDENT lists everyone; BY QUESTION groups the square');
	await panel.getByRole('tab', { name: 'לפי תלמיד' }).click();
	await expect(panel.locator('.writing-student')).toHaveCount(5, { timeout: 20_000 });
	await shot(desk, 'after-2-by-student');
	await panel.getByRole('tab', { name: 'לפי שאלה' }).click();
	await expect(panel.locator('.writing-run__place').first()).toBeVisible();
	await shot(desk, 'after-3-by-question-tab');
	await panel.getByRole('tab', { name: 'לפי תלמיד' }).click();

	step('search narrows the list by real name');
	await panel.locator('.writing-search').fill('דנה');
	await expect(panel.locator('.writing-student')).toHaveCount(1);
	await panel.locator('.writing-search').fill('');

	step("Prank's page: oldest first, three buttons always visible");
	const prankAnon = (await db.collection('agoraParticipants').doc(prankSeat).get()).data().anonName;
	await panel.locator('.writing-student', { hasText: prankAnon }).click();
	const rows = panel.locator('.mod-row');
	await expect(rows).toHaveCount(2, { timeout: 15_000 });
	await expect(rows.nth(0)).toContainText('גינה משותפת');
	await expect(rows.nth(1)).toContainText('השכנים');
	for (const name of ['לנסח מחדש', 'להסתיר מהכיתה', 'הערה', 'למחוק לצמיתות']) {
		await expect(rows.nth(0).getByRole('button', { name })).toBeVisible();
	}
	await shot(desk, 'after-4-student-page');

	step('reword: the sheet says what happens; the notice is the default and editable');
	await rows.nth(0).getByRole('button', { name: 'לנסח מחדש' }).click();
	await expect(panel.locator('.mod-row__editor')).toContainText('הכותב/ת תמיד מקבל/ת הודעה');
	await shot(desk, 'after-5-reword-sheet');
	await panel.locator('textarea').first().fill('אפשר לבנות גינה קהילתית ליד בית הספר');
	await panel.locator('.mod-row__editor .btn--primary').click();
	await waitFor('the wording to land', async () =>
		(await statementOf(lineOne)).statement.includes('קהילתית'),
	);
	let thread = await threadOf(sessionId, prank.userId);
	eq('one reword notice', thread.filter((line) => line.moderation === 'edited').length, 1);
	eq(
		'the notice carries the default text',
		thread.find((line) => line.moderation === 'edited').text,
		'ניסחנו מחדש את הטקסט שלך כדי שיהיה ברור יותר.',
	);
	eq(
		'and the old words',
		thread.find((line) => line.moderation === 'edited').removedText,
		'אפשר לבנות גינה משותפת ליד בית הספר',
	);
	await expect(rows.nth(0)).toContainText('נוסח מחדש על ידך');
	await shot(desk, 'after-6-reworded');

	step('hide with a reason: gone for the class, notice for the author, reversible');
	await rows.nth(1).getByRole('button', { name: 'להסתיר מהכיתה' }).click();
	await expect(panel.locator('.mod-row__editor')).toContainText('אפשר להחזיר אותו בכל רגע');
	await panel.getByRole('button', { name: 'לא קשור לשאלה' }).click();
	await shot(desk, 'after-7-hide-sheet');
	await panel.locator('.mod-row__editor .btn--primary').click();
	await waitFor('the text to leave the document', async () => (await statementOf(lineTwo)).hide);
	eq('text blanked', (await statementOf(lineTwo)).statement, '');
	thread = await threadOf(sessionId, prank.userId);
	const hiddenNotice = thread.find((line) => line.moderation === 'hidden');
	eq('hide notice reason', hiddenNotice.text, 'לא קשור לשאלה');
	eq(
		'the words wait on the private thread',
		hiddenNotice.removedText,
		'השכנים צריכים לדבר יותר אחד עם השני',
	);
	await expect(rows.nth(1)).toContainText('הוסתר מהכיתה');
	await shot(desk, 'after-8-hidden');
	await readThread(student, 'המורה הוריד את הטקסט הזה', 'student-hidden-notice');

	await rows.nth(1).getByRole('button', { name: 'להחזיר' }).click();
	await waitFor('the text to return', async () => !(await statementOf(lineTwo)).hide);
	eq(
		'text restored',
		(await statementOf(lineTwo)).statement,
		'השכנים צריכים לדבר יותר אחד עם השני',
	);
	thread = await threadOf(sessionId, prank.userId);
	eq('restore notice', thread.filter((line) => line.moderation === 'restored').length, 1);

	step('delete for good: confirm in the app (no window.confirm), erased, no way back');
	desk.on('dialog', () => fail('a native dialog opened'));
	await rows.nth(1).getByRole('button', { name: 'למחוק לצמיתות' }).click();
	await expect(panel.locator('.mod-row__editor')).toContainText('אי אפשר לבטל');
	await shot(desk, 'after-9-delete-sheet');
	await panel.getByRole('button', { name: 'לא קשור לשאלה' }).click();
	await panel.locator('.mod-row__editor .btn--danger-sm').click();
	await waitFor(
		'the deletion',
		async () => (await statementOf(lineTwo)).agoraModeration?.deletedAt,
	);
	const gone = await statementOf(lineTwo);
	eq('words erased', gone.statement, '');
	eq('hidden with it (out of every count)', gone.hide, true);
	thread = await threadOf(sessionId, prank.userId);
	eq(
		'no copy of the words survives on the thread',
		thread.filter((line) => line.removedText === 'השכנים צריכים לדבר יותר אחד עם השני').length,
		0,
	);
	const deleteNotice = thread.filter((line) => line.moderation === 'hidden' && line.permanent);
	eq('a permanent notice reached the author', deleteNotice.length, 1);
	eq('with the reason', deleteNotice[0].text, 'לא קשור לשאלה');
	const score = (await db.collection('agoraScores').doc(lineTwo).get()).data();
	if (score) eq('the score doc is flagged out of the count', score.hidden, true);
	await expect(panel.locator('.mod-row')).toHaveCount(1, { timeout: 15_000 });
	await shot(desk, 'after-10-deleted-gone');
	let refused = false;
	try {
		await callable(
			'agoraModerateStatement',
			{ sessionId, action: 'restore', statementId: lineTwo },
			teacher.idToken,
		);
	} catch (error) {
		refused = /deleted/.test(String(error));
	}
	eq('restore of a deleted line is refused', refused, true);
	await readThread(student, 'המורה מחק את הטקסט הזה', 'student-deleted-notice');

	step('a bot who is not the teacher cannot delete or write as the teacher');
	let denied = false;
	try {
		await callable(
			'agoraModerateStatement',
			{ sessionId, action: 'delete', statementId: botA.proposalId },
			botB.idToken,
		);
	} catch (error) {
		denied = /permission|sign in|full account/i.test(String(error));
	}
	eq('only the session teacher may delete', denied, true);

	step('remove Prank from the Class panel; he stays listed, muted, with his line');
	await panel.locator('.teacher-panel__close').click();
	await desk.locator('.teacher-panels__chip[aria-controls="teacher-panel-class"]').click();
	const classPanel = desk.locator('#teacher-panel-class');
	const prankRow = classPanel.locator('.class-panel__item', { hasText: PRANK_NAME });
	await expect(prankRow).toBeVisible({ timeout: 20_000 });
	await prankRow.locator('.class-panel__remove').click();
	await prankRow.locator('.class-panel__remove-ok').click();
	await waitFor(
		'the seat to be deleted',
		async () => !(await db.collection('agoraParticipants').doc(prankSeat).get()).exists,
	);
	await classPanel.locator('.teacher-panel__close').click();
	await textsChip.click();
	const panel2 = desk.locator('#teacher-panel-texts');
	await expect(panel2).toBeVisible();
	await panel2.getByRole('tab', { name: 'לפי תלמיד' }).click();
	const removedItem = panel2.locator('.writing-students__item--removed');
	await expect(removedItem).toHaveCount(1, { timeout: 15_000 });
	await expect(removedItem).toContainText('הוסר/ה מהכיתה');
	await shot(desk, 'after-11-removed-listed');
	await removedItem.locator('.writing-student').click();
	await expect(panel2.locator('.mod-row')).toHaveCount(1);

	step('the note button works for a removed student (it used to do nothing)');
	await panel2.locator('.mod-row').first().getByRole('button', { name: 'הערה' }).click();
	await expect(panel2.locator('.mod-row__editor')).toContainText('תוצג להם אם יחזרו');
	await panel2.locator('textarea').fill('מחכים לך בחזרה. הרעיון על הגינה היה טוב.');
	await shot(desk, 'after-12-note-to-removed');
	await panel2.locator('.mod-row__editor .btn--primary').click();
	const note = await waitFor('the note to be stored', async () =>
		(await threadOf(sessionId, prank.userId)).find((line) => line.kind === 'note'),
	);
	eq('note about the line', note.aboutStatementId, lineOne);
	eq('note text', note.text, 'מחכים לך בחזרה. הרעיון על הגינה היה טוב.');
	await expect(panel2.locator('.mod-row').first()).toContainText('נשלחה הערה');
	await shot(desk, 'after-13-note-sent');

	step('he knocks, the teacher lets him back, and the note is waiting in his thread');
	const removedScreen = student.locator('.game-removed');
	await expect(removedScreen).toHaveAttribute('data-state', 'removed', { timeout: 30_000 });
	await student.locator('.game-removed__ask').click();
	await passNameDoor(student, PRANK_NAME);
	await expect(removedScreen).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
	const request = desk.locator('[data-testid="rejoin-alert"]');
	await expect(request).toContainText(PRANK_NAME, { timeout: 20_000 });
	await request.locator('.rejoin-alert__approve').click();
	await expect(removedScreen).toHaveCount(0, { timeout: 30_000 });
	await waitFor(
		'his seat back',
		async () => (await db.collection('agoraParticipants').doc(prankSeat).get()).exists,
	);
	await student.getByRole('button', { name: 'הודעה מהמורה' }).first().click();
	await expect(student.locator('.teacher-thread')).toContainText(
		'מחכים לך בחזרה. הרעיון על הגינה היה טוב.',
		{ timeout: 20_000 },
	);
	await shot(student, 'student-note-after-rejoin');

	console.log('\nALL WRITING-VIEW CHECKS PASSED');
	void parentId;
	void botC;
} finally {
	await browser.close();
}
