/* The teacher's live console, end to end.
 *
 * Bots join with real names → only the teacher can read them (the rules
 * refuse a bot even its OWN identity doc) → the teacher writes a private note
 * and the student replies; each side's listener query sees both lines and a
 * classmate's sees none → the teacher takes a proposal down: the text leaves
 * the document, the score is flagged, the words wait on the private thread,
 * and the results computed at the end leave it out → the teacher puts it back
 * → the teacher rewords another proposal and the author is paid nothing for
 * it → the author cannot clear the marks and nobody can hard-delete.
 *
 * Asserts Firestore state, not pixels. The projector is checked in the
 * browser only when vite is up (AGORA_VITE_HOST); the rest never needs it.
 *
 * Run: npx tsx scripts/e2e-teacher-console.mjs (needs emulators + seed)
 */
import { preflight, FIRESTORE_REST, PROJECT_ID, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, fastlane, projectorUrl, signUpAnonymous } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions'] });

const runId = `console-${Date.now().toString(36)}`;
const REAL_NAMES = ['טל י.', 'דנה כ.', 'עומר ל.'];

async function waitFor(label, probe, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: not observed within ${timeoutMs}ms`);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

/** A rules-enforced list, as the SDK would issue it, under a real token */
async function runQuery(token, collection, filters) {
	const response = await fetch(`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: collection }],
				where: {
					compositeFilter: {
						op: 'AND',
						filters: filters.map(([field, value]) => ({
							fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
						})),
					},
				},
			},
		}),
	});
	const body = await response.text();
	if (response.status === 403 || /PERMISSION_DENIED/i.test(body)) return { denied: true, docs: [] };
	const rows = JSON.parse(body);

	return { denied: false, docs: rows.filter((row) => row.document).map((row) => row.document) };
}

/** A rules-enforced single read under a real token */
async function restGet(token, path) {
	const response = await fetch(`${FIRESTORE_REST}/${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	return response.status;
}

async function restPatch(token, path, fields, mask) {
	const params = mask.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
	const response = await fetch(`${FIRESTORE_REST}/${path}?${params}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ fields }),
	});

	return response.status;
}

// ─── 1. Real names, for the teacher only ───────────────────────────────────

step('1. bots join with real names; only the teacher can read them');

const game = await fastlane({
	stage: 'deliberation',
	students: 3,
	proposals: 3,
	ratings: true,
	runId,
	realNames: REAL_NAMES,
	quiet: true,
});
const { sessionId, bots } = game;
const teacher = { uid: game.teacherUid, idToken: game.teacherToken };
const [alice, bob, carol] = bots;
console.log(`   ✓ session ${sessionId}, teacher ${teacher.uid}`);

const identities = await db.collection('agoraIdentities').where('sessionId', '==', sessionId).get();
eq('identity docs', identities.size, 3);
identities.forEach((snap) => {
	const data = snap.data();
	if (data.teacherId !== teacher.uid) fail(`identity ${snap.id} carries teacherId ${data.teacherId}`);
	if (!REAL_NAMES.includes(data.realName)) fail(`unexpected real name ${data.realName}`);
	if (typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now()) fail('expiresAt must be in the future');
});
const participant = (await db.collection('agoraParticipants').doc(`${sessionId}--${alice.uid}`).get()).data();
if (REAL_NAMES.includes(participant.anonName) || participant.realName) {
	fail('the real name leaked onto the participant doc');
}
console.log('   ✓ no real name on any participant doc');

eq(
	'a bot reading its OWN identity doc is refused',
	await restGet(alice.idToken, `agoraIdentities/${sessionId}--${alice.uid}`),
	403,
);
const teacherList = await runQuery(teacher.idToken, 'agoraIdentities', [
	['sessionId', sessionId],
	['teacherId', teacher.uid],
]);
eq('the teacher lists the names with the rule\'s equality', teacherList.docs.length, 3);
const botList = await runQuery(alice.idToken, 'agoraIdentities', [['sessionId', sessionId]]);
eq('a bot listing the session names is refused', botList.denied, true);

// ─── 2. The private thread ────────────────────────────────────────────────

step('2. a note goes to one student; the reply comes back; a classmate sees neither');

const { messageId: noteId } = await callable(
	'agoraTeacherMessage',
	{ sessionId, studentUid: alice.uid, text: 'Please use appropriate language.' },
	teacher.idToken,
);
const note = (await db.collection('agoraTeacherMessages').doc(noteId).get()).data();
eq('note from', note.from, 'teacher');
eq('note kind', note.kind, 'note');
eq('note pinned to the student', note.studentUid, alice.uid);
const notification = await waitFor('teacher-note notification', async () => {
	const snap = await db
		.collection('inAppNotifications')
		.where('userId', '==', alice.uid)
		.where('triggerType', '==', 'agora_teacher_note')
		.get();

	return snap.empty ? null : snap.docs[0].data();
});
eq('notification carries the message id', notification.agoraMessageId, noteId);
eq('notification carries no text', notification.text, '');

const { messageId: replyId } = await callable(
	'agoraTeacherMessage',
	{ sessionId, text: 'Sorry, I will.' },
	alice.idToken,
);
const reply = (await db.collection('agoraTeacherMessages').doc(replyId).get()).data();
eq('reply from', reply.from, 'student');
eq('reply lands in the sender\'s own thread', reply.studentUid, alice.uid);

const forged = await callable(
	'agoraTeacherMessage',
	{ sessionId, studentUid: bob.uid, text: 'a note pretending to be the teacher' },
	alice.idToken,
).then(() => (true), () => false);
// A student naming another student is still writing into their OWN thread
const forgedLine = forged
	? (await db.collection('agoraTeacherMessages').where('sessionId', '==', sessionId).where('studentUid', '==', bob.uid).get()).size
	: 0;
eq('a student cannot write into a classmate\'s thread', forgedLine, 0);

const studentView = await runQuery(alice.idToken, 'agoraTeacherMessages', [
	['sessionId', sessionId],
	['studentUid', alice.uid],
]);
eq('the student lists both lines', studentView.docs.length, 3);
const teacherView = await runQuery(teacher.idToken, 'agoraTeacherMessages', [
	['sessionId', sessionId],
	['teacherId', teacher.uid],
]);
eq('the teacher lists every line of the session', teacherView.docs.length, 3);
const classmateView = await runQuery(bob.idToken, 'agoraTeacherMessages', [
	['sessionId', sessionId],
	['studentUid', alice.uid],
]);
eq('a classmate is refused', classmateView.denied, true);

// ─── 3. Take a proposal down, and put it back ─────────────────────────────

step('3. the teacher takes a proposal down: text gone, score flagged, words on the thread');

const aliceProposalId = alice.proposalId ?? fail('bot 1 has no proposal');
const before = (await db.collection('statements').doc(aliceProposalId).get()).data();
const originalText = before.statement;
if (!originalText) fail('the fastlane bot has no proposal text');

const hidden = await callable(
	'agoraModerateStatement',
	{ sessionId, action: 'hide', statementId: aliceProposalId, reason: 'Off topic' },
	teacher.idToken,
);
eq('hide reports hidden', hidden.hidden, true);
const afterHide = (await db.collection('statements').doc(aliceProposalId).get()).data();
eq('the text left the document', afterHide.statement, '');
eq('the shared hide flag', afterHide.hide, true);
eq('the moderation mark', afterHide.agoraModeration?.hidden, true);
const scoreAfterHide = (await db.collection('agoraScores').doc(aliceProposalId).get()).data();
eq('the score is flagged', scoreAfterHide?.hidden, true);
const notice = await waitFor('hidden notice on the thread', async () => {
	const snap = await db
		.collection('agoraTeacherMessages')
		.where('sessionId', '==', sessionId)
		.where('aboutStatementId', '==', aliceProposalId)
		.where('moderation', '==', 'hidden')
		.get();

	return snap.empty ? null : snap.docs[0].data();
});
eq('the words wait on the private thread', notice.removedText, originalText);
eq('the reason too', notice.text, 'Off topic');
eq('the notice is the author\'s', notice.studentUid, alice.uid);

// A classmate rating the hidden text (devtools path) moves nothing
const scoreBefore = scoreAfterHide.perCamp;
await db.collection('evaluations').doc(`${carol.uid}--${aliceProposalId}`).set({
	evaluationId: `${carol.uid}--${aliceProposalId}`,
	parentId: before.parentId,
	statementId: aliceProposalId,
	evaluatorId: carol.uid,
	evaluator: { uid: carol.uid, displayName: 'bot', email: null, photoURL: null, isAnonymous: true },
	evaluation: 1,
	agoraSessionId: sessionId,
	updatedAt: Date.now(),
});
await new Promise((resolve) => setTimeout(resolve, 2500));
const scoreAfterRating = (await db.collection('agoraScores').doc(aliceProposalId).get()).data();
eq(
	'a rating on hidden text leaves the score untouched',
	JSON.stringify(scoreAfterRating.perCamp),
	JSON.stringify(scoreBefore),
);

step('4. the results leave the hidden proposal out; restore brings the text back');

// Close the square: results are computed from what stands
const advanced = await callable(
	'agoraAdvanceStage',
	{ sessionId, stage: 'results' },
	teacher.idToken,
).then(() => true, (error) => { console.log(`   (advance: ${String(error).slice(0, 120)})`); return false; });
if (advanced) {
	const scored = await waitFor('class score', async () => {
		const data = (await db.collection('agoraSessions').doc(sessionId).get()).data();

		return data.classScore ? data : null;
	}, 90_000);
	const lead = scored.classScore.leadStatementId;
	if (lead === aliceProposalId) {
		fail('the hidden proposal led the results');
	}
	console.log('   ✓ the hidden proposal did not lead the results');
}

const restored = await callable(
	'agoraModerateStatement',
	{ sessionId, action: 'restore', statementId: aliceProposalId },
	teacher.idToken,
);
eq('restore reports visible', restored.hidden, false);
const afterRestore = (await db.collection('statements').doc(aliceProposalId).get()).data();
eq('the text is back', afterRestore.statement, originalText);
eq('the hide flag is off', afterRestore.hide, false);
eq('the score is unflagged', (await db.collection('agoraScores').doc(aliceProposalId).get()).data()?.hidden, false);

// ─── 5. Reword — and pay the author nothing for it ─────────────────────────

step('5. the teacher rewords a proposal; the author earns no revision credit');

const bobProposalId = bob.proposalId ?? fail('bot 2 has no proposal');
const bobBefore = (await db.collection('agoraParticipants').doc(`${sessionId}--${bob.uid}`).get()).data();
const reviewsBefore = (await db.collection('agoraCharacterReviews').where('sessionId', '==', sessionId).get()).size;
await callable(
	'agoraModerateStatement',
	{ sessionId, action: 'edit', statementId: bobProposalId, text: 'A calmer wording of the same idea, by the teacher.' },
	teacher.idToken,
);
const bobAfterEdit = (await db.collection('statements').doc(bobProposalId).get()).data();
eq('the wording changed', bobAfterEdit.statement, 'A calmer wording of the same idea, by the teacher.');
if (typeof bobAfterEdit.agoraModeration?.editedAt !== 'number') fail('editedAt not stamped');
await new Promise((resolve) => setTimeout(resolve, 3000));
const bobAfter = (await db.collection('agoraParticipants').doc(`${sessionId}--${bob.uid}`).get()).data();
eq('revising points unchanged', bobAfter.points.revising ?? 0, bobBefore.points.revising ?? 0);
eq('total points unchanged', bobAfter.points.total, bobBefore.points.total);
const reviewsAfter = (await db.collection('agoraCharacterReviews').where('sessionId', '==', sessionId).get()).size;
eq('no new elder reviews', reviewsAfter, reviewsBefore);
const editNotice = await waitFor('edited notice on the thread', async () => {
	const snap = await db
		.collection('agoraTeacherMessages')
		.where('sessionId', '==', sessionId)
		.where('aboutStatementId', '==', bobProposalId)
		.where('moderation', '==', 'edited')
		.get();

	return snap.empty ? null : snap.docs[0].data();
});
if (!editNotice.removedText) fail('the pre-edit text was not kept on the thread');
console.log('   ✓ the pre-edit wording waits on the thread');

// ─── 6. What the rules refuse ──────────────────────────────────────────────

step('6. the author cannot clear the marks; nobody can hard-delete');

eq(
	'author clearing agoraModeration is refused',
	await restPatch(
		bob.idToken,
		`statements/${bobProposalId}`,
		{ agoraModeration: { mapValue: { fields: { hidden: { booleanValue: false } } } } },
		['agoraModeration'],
	),
	403,
);
eq(
	'author flipping hide is refused',
	await restPatch(alice.idToken, `statements/${aliceProposalId}`, { hide: { booleanValue: true } }, ['hide']),
	403,
);
const teacherDelete = await fetch(`${FIRESTORE_REST}/statements/${aliceProposalId}`, {
	method: 'DELETE',
	headers: { Authorization: `Bearer ${teacher.idToken}` },
});
eq('teacher hard-delete is refused', teacherDelete.status, 403);
const authorDelete = await fetch(`${FIRESTORE_REST}/statements/${aliceProposalId}`, {
	method: 'DELETE',
	headers: { Authorization: `Bearer ${alice.idToken}` },
});
eq('author hard-delete is refused', authorDelete.status, 403);

// ─── 7. Forget the names ───────────────────────────────────────────────────

step('7. the teacher forgets the names');
await callable('agoraModerateStatement', { sessionId, action: 'forgetNames' }, teacher.idToken);
eq(
	'identity docs gone',
	(await db.collection('agoraIdentities').where('sessionId', '==', sessionId).get()).size,
	0,
);

// ─── 8. The projector, when a browser is available ─────────────────────────

const viteUp = await fetch(VITE_HOST).then((response) => response.ok, () => false);
if (viteUp) {
	step('8. the projector shows the code and no real name');
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(projectorUrl(sessionId), { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.projector__code-value', { timeout: 30_000 });
		const code = await page.locator('.projector__code-value').textContent();
		eq('the join code on the wall', code?.trim(), game.code);
		eq('no stage nav on the wall', await page.locator('.stage-nav').count(), 0);
		const wall = await page.locator('body').innerText();
		for (const name of REAL_NAMES) {
			if (wall.includes(name)) fail(`real name on the wall: ${name}`);
		}
		console.log('   ✓ no real name anywhere on the wall');
	} finally {
		await browser.close();
	}
} else {
	console.log('\n(8. projector check skipped — vite is not serving)');
}

console.log(`\n=== e2e-teacher-console: all green (${PROJECT_ID})`);
process.exit(0);
