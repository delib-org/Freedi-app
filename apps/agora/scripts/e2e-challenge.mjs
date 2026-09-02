/* The challenge round, end to end.
 *
 * A class is voting. One student at a time puts a NEW option on the board, the
 * room re-votes, and the option with the fewest votes falls. This asserts the
 * things a screenshot cannot: that the teacher's switch actually gates the
 * round, that only the student holding the floor may speak, that a seat is won
 * only by STRICTLY out-polling the weakest incumbent, that the loser's voters
 * get their vote back, and that resolving twice cannot pay twice.
 *
 * Run: node scripts/e2e-challenge.mjs
 *   (needs emulators started FROM THIS WORKTREE — the functions emulator loads
 *    code from whichever tree launched it, and agoraChallengeTurn will simply
 *    not exist if that was another one.)
 */
import { preflight, FUNCTIONS_BASE, FIRESTORE_REST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { fastlane } from './lib/fastlane.ts';

await preflight();

const owner = { Authorization: 'Bearer owner' };

async function readDoc(path) {
	const response = await fetch(`${FIRESTORE_REST}/${path}`, { headers: owner });
	if (!response.ok) return null;

	return response.json();
}

function plain(value) {
	if (value === undefined || value === null) return undefined;
	if ('stringValue' in value) return value.stringValue;
	if ('integerValue' in value) return Number(value.integerValue);
	if ('doubleValue' in value) return value.doubleValue;
	if ('booleanValue' in value) return value.booleanValue;
	if ('nullValue' in value) return null;
	if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(plain);
	if ('mapValue' in value) {
		return Object.fromEntries(
			Object.entries(value.mapValue.fields ?? {}).map(([key, inner]) => [key, plain(inner)]),
		);
	}

	return undefined;
}

const fieldsOf = (doc) =>
	Object.fromEntries(Object.entries(doc?.fields ?? {}).map(([key, value]) => [key, plain(value)]));

/** Returns { result } or { error } — refusals are assertions here, not crashes */
async function tryCallable(name, data, token) {
	const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		signal: AbortSignal.timeout(120_000),
	});

	return response.json();
}

async function callable(name, data, token) {
	const json = await tryCallable(name, data, token);
	if (json.error) fail(`${name} failed: ${json.error.message ?? ''}`);

	return json.result;
}

const turn = (sessionId, action, token, extra = {}) =>
	callable('agoraChallengeTurn', { sessionId, action, ...extra }, token);

const tryTurn = (sessionId, action, token, extra = {}) =>
	tryCallable('agoraChallengeTurn', { sessionId, action, ...extra }, token);

/**
 * Write as a real signed-in client, so the rules apply to every write this
 * script makes. The mask matters: a PATCH without one REPLACES the document
 * with the fields given, which on a session doc means wiping teacherId and
 * being refused — silently, unless somebody reads the response.
 */
async function clientWrite(path, fields, token, mask = []) {
	const query = mask.map((field) => `updateMask.fieldPaths=${field}`).join('&');
	const response = await fetch(`${FIRESTORE_REST}/${path}${query ? `?${query}` : ''}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ fields }),
	});
	if (!response.ok) {
		const body = await response.text();
		fail(`write to ${path} refused: ${response.status} ${body.slice(0, 200)}`);
	}

	return response;
}

const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });

const castVote = (questionId, bot, statementId) =>
	clientWrite(
		`votes/${bot.uid}--${questionId}`,
		{
			voteId: str(`${bot.uid}--${questionId}`),
			statementId: str(statementId),
			userId: str(bot.uid),
			parentId: str(questionId),
			createdAt: num(Date.now()),
			lastUpdate: num(Date.now()),
		},
		bot.idToken,
	);

const session = (sessionId) => readDoc(`agoraSessions/${sessionId}`).then(fieldsOf);
const game = (sessionId) => session(sessionId).then((doc) => doc.votingGame ?? {});
const board = (sessionId) => session(sessionId).then((doc) => doc.voting?.candidateIds ?? []);

async function points(sessionId, uid) {
	const doc = fieldsOf(await readDoc(`agoraParticipants/${sessionId}--${uid}`));

	return doc.points?.total ?? 0;
}

/** The counting trigger runs after the write returns — wait for the number. */
async function waitForSelections(questionId, predicate, what) {
	const deadline = Date.now() + 45_000;
	for (;;) {
		const question = fieldsOf(await readDoc(`statements/${questionId}`));
		const selections = question.selections ?? {};
		if (predicate(selections)) return selections;
		if (Date.now() > deadline) fail(`${what} — last seen: ${JSON.stringify(selections)}`);
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
}

// ---------------------------------------------------------------------------

step('A class has deliberated, rated, and reached the ballot');
const run = await fastlane({
	stage: 'voting',
	students: 5,
	proposals: 3,
	ratings: true,
	runId: `e2e-challenge-${Date.now().toString(36)}`,
	quiet: true,
});
const teacher = run.teacherToken;
const questionId = (await session(run.sessionId)).challengeQuestionId;
const startingBoard = await board(run.sessionId);
eq('the ballot stands three proposals', startingBoard.length, 3);

step('The round is refused until the teacher opens the ballot to new options');
const refusedWhileOff = await tryTurn(run.sessionId, 'start', teacher);
if (!refusedWhileOff.error) fail('the round started while challengeGame was off');
console.log(`   refused: ${refusedWhileOff.error.status}`);

await clientWrite(
	`agoraSessions/${run.sessionId}`,
	{
		votingSettings: {
			mapValue: {
				fields: { enabled: { booleanValue: true }, challengeGame: { booleanValue: true } },
			},
		},
	},
	teacher,
	['votingSettings'],
);

step('Only the teacher may open the round');
const student = run.bots[0];
const refusedForStudent = await tryTurn(run.sessionId, 'start', student.idToken);
if (!refusedForStudent.error) fail('a student opened the challenge round');

await turn(run.sessionId, 'start', teacher);
const opened = await game(run.sessionId);
eq('the round opens between turns', opened.phase, 'idle');
eq('the rotation is the whole class', opened.order.length, 5);
eq('the default cap applies when the teacher set none', opened.maxTurns, 8);
const firstSpeaker = run.bots.find((bot) => bot.uid === opened.speakerUserId);
if (!firstSpeaker) fail('the first speaker is not one of the seated students');
console.log(`   on the floor: ${opened.speakerAnonName}`);

step('Only the student holding the floor may speak');
await turn(run.sessionId, 'openFloor', teacher);
const other = run.bots.find((bot) => bot.uid !== firstSpeaker.uid);
const refusedForOther = await tryTurn(run.sessionId, 'pitch', other.idToken, {
	text: 'הצעה של מישהו שלא על הבמה',
});
if (!refusedForOther.error) fail('a student who did not hold the floor pitched');

step('The speaker puts a new option on the board');
const pointsBefore = await points(run.sessionId, firstSpeaker.uid);
await turn(run.sessionId, 'pitch', firstSpeaker.idToken, {
	text: 'כרטיס נסיעה חינם לכל תלמיד בקו העירוני, במימון עירוני',
});
const challengerId = `${run.sessionId}--${firstSpeaker.uid}--challenge`;
const challengerDoc = fieldsOf(await readDoc(`statements/${challengerId}`));
eq('the challenge is flagged as one', challengerDoc.agoraChallenge, true);
eq('it belongs to the student who wrote it', challengerDoc.creatorId, firstSpeaker.uid);
eq('the official board has not changed yet', (await board(run.sessionId)).length, 3);

// The proposal trigger must step aside: a challenge pays for surviving, and
// must not also collect the first-draft credit on the way in.
await new Promise((resolve) => setTimeout(resolve, 3_000));
eq(
	'writing the challenge paid nothing by itself',
	await points(run.sessionId, firstSpeaker.uid),
	pointsBefore,
);

step('The room votes, blind, and the challenger out-polls the weakest');
await turn(run.sessionId, 'openVote', teacher);
eq('the vote is open', (await game(run.sessionId)).phase, 'vote');

// One vote on each incumbent, two on the challenger. That leaves the three
// incumbents TIED at the bottom, which is the interesting case: the seat has
// to be taken from the least agreed of them, and `startingBoard` is in
// consensus order, so the last of it is the one that must fall.
await castVote(questionId, run.bots[0], startingBoard[0]);
await castVote(questionId, run.bots[1], startingBoard[1]);
await castVote(questionId, run.bots[2], startingBoard[2]);
await castVote(questionId, run.bots[3], challengerId);
await castVote(questionId, run.bots[4], challengerId);
await waitForSelections(
	questionId,
	(selections) =>
		selections[challengerId] === 2 &&
		selections[startingBoard[0]] === 1 &&
		selections[startingBoard[1]] === 1 &&
		selections[startingBoard[2]] === 1,
	'the votes never reached the question',
);

step('The teacher closes the vote — a seat is won, and one is lost');
const outcome = await turn(run.sessionId, 'resolve', teacher);
eq('the challenger survived', outcome.outcome.survived, true);
eq('it drew two votes', outcome.outcome.challengerVotes, 2);
eq(
	'the least agreed of the tied incumbents fell',
	outcome.outcome.evictedStatementId,
	startingBoard[2],
);

const afterBoard = await board(run.sessionId);
eq('the board is the size it was', afterBoard.length, 3);
if (afterBoard.includes(startingBoard[2])) fail('the evicted option is still standing');
if (!afterBoard.includes(challengerId)) fail('the challenger did not take the seat');

// Results.voteCard reads the winner's TEXT from here — an id alone would render
// the recap blank.
const candidates = (await session(run.sessionId)).voting.candidates;
const seated = candidates.find((candidate) => candidate.statementId === challengerId);
if (!seated?.statement) fail('the seated challenger carries no text');

eq(
	'surviving paid the speaker',
	await points(run.sessionId, firstSpeaker.uid),
	pointsBefore + 3,
);

step("The evicted option's voters got their vote back");
const freed = fieldsOf(await readDoc(`votes/${run.bots[2].uid}--${questionId}`));
eq('a vote stranded on the evicted option was released', freed.statementId, 'none');

step('Resolving twice cannot pay twice');
const doubleResolve = await tryTurn(run.sessionId, 'resolve', teacher);
if (!doubleResolve.error) fail('the same challenge resolved twice');
eq(
	'the second resolve paid nothing',
	await points(run.sessionId, firstSpeaker.uid),
	pointsBefore + 3,
);

step('A student may pass, and passing costs nothing');
await turn(run.sessionId, 'next', teacher);
const second = await game(run.sessionId);
const passer = run.bots.find((bot) => bot.uid === second.speakerUserId);
const passerBefore = await points(run.sessionId, passer.uid);
await turn(run.sessionId, 'openFloor', teacher);
const passed = await turn(run.sessionId, 'pass', passer.idToken);
eq('the turn is recorded as a pass', passed.outcome.by, 'pass');
eq('passing cost nothing', await points(run.sessionId, passer.uid), passerBefore);
eq('a pass leaves the board alone', (await board(run.sessionId)).length, 3);

// The exact tie (challenger equals the weakest) is covered in the unit tests —
// here the room simply does not move, which is the case a class actually meets.
step('A challenger the room does not move toward takes no seat');
await turn(run.sessionId, 'next', teacher);
const third = await game(run.sessionId);
const loser = run.bots.find((bot) => bot.uid === third.speakerUserId);
await turn(run.sessionId, 'openFloor', teacher);
await turn(run.sessionId, 'pitch', loser.idToken, {
	text: 'לבטל את כל שיעורי הבית בכל המקצועות, לצמיתות',
});
const loserId = `${run.sessionId}--${loser.uid}--challenge`;
const loserBefore = await points(run.sessionId, loser.uid);
const boardBeforeLoss = await board(run.sessionId);
await turn(run.sessionId, 'openVote', teacher);
// Nobody moves: the challenger draws nothing and cannot beat anything.
const lost = await turn(run.sessionId, 'resolve', teacher);
eq('a challenger nobody voted for does not stand', lost.outcome.survived, false);
eq('failing cost the student nothing', await points(run.sessionId, loser.uid), loserBefore);
const boardAfterLoss = await board(run.sessionId);
eq('the board stands unchanged', boardAfterLoss.join('|'), boardBeforeLoss.join('|'));
if (await readDoc(`statements/${loserId}`)) fail('the rejected challenge was left behind');

step('The teacher ends the round, and the recap counts the final board');
await turn(run.sessionId, 'end', teacher);
eq('the round is closed', (await game(run.sessionId)).phase, 'ended');

await callable('agoraAdvanceStage', { sessionId: run.sessionId, stage: 'results' }, teacher);
const deadline = Date.now() + 90_000;
let score;
for (;;) {
	score = (await session(run.sessionId)).classScore;
	if (score) break;
	if (Date.now() > deadline) fail('the recap never landed');
	await new Promise((resolve) => setTimeout(resolve, 500));
}
if (score.voteCounts && startingBoard[2] in score.voteCounts) {
	fail('the recap counted votes for an option that had been evicted');
}
if (!afterBoard.includes(score.voteWinnerStatementId)) {
	fail('the elected proposal is not on the final board');
}
console.log(`   the class elected ${score.voteWinnerStatementId}`);

console.log('\n✅ e2e-challenge passed\n');
