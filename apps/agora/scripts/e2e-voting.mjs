/* The voting stage, end to end.
 *
 * Deliberation ends → the teacher says how many proposals stand → the ballot is
 * drawn up server-side from the SHARED consensus metric → students vote through
 * the real votes collection (so the tightened rules and the counting trigger
 * are both exercised) → the recap crowns what the class elected, unless the
 * teacher set an agreement bar the winner failed to clear.
 *
 * Asserts Firestore state, not pixels: a screenshot proves a screen rendered,
 * not that a vote was counted.
 *
 * Run: node scripts/e2e-voting.mjs (needs emulators + vite on 3009 + seed)
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

/** Firestore REST values → plain JS, for the shapes this script reads */
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

async function callable(name, data, token) {
	const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		signal: AbortSignal.timeout(120_000),
	});
	const json = await response.json();
	if (json.error) fail(`${name} failed: ${json.error.message ?? ''}`);

	return json.result;
}

/**
 * Write as a real signed-in client — the rules apply. Every vote in this script
 * goes through here, so a rules regression fails the test instead of hiding
 * behind an admin write that was never subject to them.
 */
async function clientWrite(path, fields, token, mask = []) {
	const query = mask.map((field) => `updateMask.fieldPaths=${field}`).join('&');
	const response = await fetch(`${FIRESTORE_REST}/${path}${query ? `?${query}` : ''}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ fields }),
	});

	return response;
}

const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });

const castVote = (sessionQuestionId, bot, statementId) =>
	clientWrite(
		`votes/${bot.uid}--${sessionQuestionId}`,
		{
			voteId: str(`${bot.uid}--${sessionQuestionId}`),
			statementId: str(statementId),
			userId: str(bot.uid),
			parentId: str(sessionQuestionId),
			createdAt: num(Date.now()),
			lastUpdate: num(Date.now()),
		},
		bot.idToken,
	);

/**
 * The counting trigger runs after the write returns — wait for the number.
 * Generous, because the emulator queues trigger fan-out behind the ratings
 * this session just seeded.
 */
async function waitForSelections(questionId, predicate, what) {
	const deadline = Date.now() + 45_000;
	for (;;) {
		const question = fieldsOf(await readDoc(`statements/${questionId}`));
		const selections = question.selections ?? {};
		if (predicate(selections)) return selections;
		if (Date.now() > deadline) {
			fail(`${what} — last seen: ${JSON.stringify(selections)}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
}

async function waitForClassScore(sessionId) {
	const deadline = Date.now() + 90_000;
	for (;;) {
		const session = fieldsOf(await readDoc(`agoraSessions/${sessionId}`));
		if (session.classScore) return session;
		if (Date.now() > deadline) fail('the recap never landed on the session');
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

// ---------------------------------------------------------------------------

step('A class deliberates, rates, and reaches the end of the square');
const run = await fastlane({
	stage: 'deliberation',
	students: 4,
	proposals: 3,
	ratings: true,
	runId: `e2e-voting-${Date.now().toString(36)}`,
	quiet: true,
});
const questionId = fieldsOf(await readDoc(`agoraSessions/${run.sessionId}`)).challengeQuestionId;
console.log(`   session ${run.sessionId}, question ${questionId}`);

// The ranking the ballot must respect, taken from the shared metric itself
const ranked = [];
for (const bot of run.bots) {
	if (!bot.proposalId) continue;
	const proposal = fieldsOf(await readDoc(`statements/${bot.proposalId}`));
	ranked.push({ statementId: bot.proposalId, consensus: proposal.consensus ?? 0 });
}
ranked.sort((a, b) => b.consensus - a.consensus);
console.log(`   consensus order: ${ranked.map((r) => r.consensus.toFixed(3)).join(' > ')}`);

step('The teacher says only the top two stand');
await clientWrite(
	`agoraSessions/${run.sessionId}`,
	{
		votingSettings: {
			mapValue: {
				fields: {
					enabled: { booleanValue: true },
					selection: {
						mapValue: {
							fields: {
								resultsBy: str('consensus'),
								cutoffBy: str('topOptions'),
								numberOfResults: num(2),
							},
						},
					},
				},
			},
		},
	},
	run.teacherToken,
	['votingSettings'],
).then((response) => {
	if (!response.ok) fail(`the teacher could not save the voting settings (HTTP ${response.status})`);
});

step('Opening the vote draws up the ballot');
await callable('agoraAdvanceStage', { sessionId: run.sessionId, stage: 'voting' }, run.teacherToken);

const votingSession = fieldsOf(await readDoc(`agoraSessions/${run.sessionId}`));
const ballot = votingSession.voting;
eq('candidates on the ballot', ballot.candidateIds.length, 2);
eq('the ballot is the top two by consensus', ballot.candidateIds.join(), [
	ranked[0].statementId,
	ranked[1].statementId,
].join());

// isChosen is how the shared selector marks its answer — the ballot must be
// that answer and not a second opinion computed alongside it.
for (const { statementId } of ranked) {
	const onBallot = ballot.candidateIds.includes(statementId);
	const proposal = fieldsOf(await readDoc(`statements/${statementId}`));
	eq(`isChosen on ${statementId.slice(-3)}`, proposal.isChosen === true, onBallot);
}

step('The class votes — and the runner-up wins it');
// Deliberately NOT the consensus leader: this is what proves the election
// outranks the ranking that got the proposals onto the ballot.
const [leaderByConsensus, runnerUp] = ballot.candidateIds;
const voters = run.bots.slice(0, 3);
await castVote(questionId, voters[0], runnerUp);
await castVote(questionId, voters[1], runnerUp);
const changing = voters[2];
await castVote(questionId, changing, leaderByConsensus);

await waitForSelections(
	questionId,
	(selections) => selections[runnerUp] === 2 && selections[leaderByConsensus] === 1,
	'the tallies never reached 2–1',
);
console.log('   tallies: 2 for the runner-up, 1 for the consensus leader');

step('A student changes their mind');
await castVote(questionId, changing, runnerUp);
await waitForSelections(
	questionId,
	(selections) => selections[runnerUp] === 3 && (selections[leaderByConsensus] ?? 0) === 0,
	'changing a vote did not move the count',
);
console.log('   the moved vote was added to one option and taken off the other');

step('A vote may not be cast into someone else’s slot');
const forged = await clientWrite(
	`votes/${voters[0].uid}--${questionId}`,
	{
		voteId: str(`${voters[0].uid}--${questionId}`),
		statementId: str(leaderByConsensus),
		userId: str(voters[0].uid),
		parentId: str(questionId),
		lastUpdate: num(Date.now()),
	},
	voters[1].idToken,
);
eq('the rules refuse a vote written by someone else', forged.ok, false);

step('The recap crowns what the class elected');
await callable('agoraAdvanceStage', { sessionId: run.sessionId, stage: 'results' }, run.teacherToken);
const scored = await waitForClassScore(run.sessionId);
const score = scored.classScore;

eq('the elected proposal', score.voteWinnerStatementId, runnerUp);
eq('votes counted for it', score.voteCounts[runnerUp], 3);
eq('total votes', score.voteTotal, 3);
eq('it cleared the (unset) bar', score.voteWinnerMetThreshold, true);
// The whole point: the vote, not the consensus ranking, decides who leads.
eq('the recap leads with the elected proposal', score.leadStatementId, runnerUp);

// ---------------------------------------------------------------------------

step('A second class votes under an agreement bar it cannot clear');
const strict = await fastlane({
	stage: 'deliberation',
	students: 4,
	proposals: 3,
	ratings: true,
	runId: `e2e-voting-bar-${Date.now().toString(36)}`,
	quiet: true,
});
const strictQuestionId = fieldsOf(await readDoc(`agoraSessions/${strict.sessionId}`))
	.challengeQuestionId;

await clientWrite(
	`agoraSessions/${strict.sessionId}`,
	{
		votingSettings: {
			mapValue: {
				fields: {
					enabled: { booleanValue: true },
					// Nothing a class of four can reach — that is the test
					winningConsensusThreshold: { doubleValue: 0.99 },
				},
			},
		},
	},
	strict.teacherToken,
	['votingSettings'],
);

await callable(
	'agoraAdvanceStage',
	{ sessionId: strict.sessionId, stage: 'voting' },
	strict.teacherToken,
);
const strictBallot = fieldsOf(await readDoc(`agoraSessions/${strict.sessionId}`)).voting;
if (!strictBallot.candidateIds.length) fail('the strict session drew an empty ballot');

// The class elects its LEAST agreed-on candidate — the case the bar exists for.
// (Electing the top one would clear a 0.99 bar honestly, since the seeded
// ratings put its consensus at exactly 1.)
const strictChoice = strictBallot.candidateIds[strictBallot.candidateIds.length - 1];
const strictChoiceCp =
	strictBallot.candidates.find((candidate) => candidate.statementId === strictChoice)?.consensus ??
	0;
if (strictChoiceCp >= 0.99) fail('the seeded ratings left no candidate below the bar');
await castVote(strictQuestionId, strict.bots[0], strictChoice);
await waitForSelections(
	strictQuestionId,
	(selections) => selections[strictChoice] === 1,
	'the strict session never counted its vote',
);

await callable(
	'agoraAdvanceStage',
	{ sessionId: strict.sessionId, stage: 'results' },
	strict.teacherToken,
);
const strictScored = await waitForClassScore(strict.sessionId);
const strictScore = strictScored.classScore;

// Named, because the class chose it and has to be told so...
eq('the most-voted proposal is still named', strictScore.voteWinnerStatementId, strictChoice);
eq('but it did not clear the bar', strictScore.voteWinnerMetThreshold, false);
eq('the bar is echoed for the screen', strictScore.winningConsensusThreshold, 0.99);
// ...but it does not take the crown. The recap goes back to the proposal the
// class actually agreed on most.
if (strictScore.leadStatementId === strictChoice) {
	fail('a winner below the agreement bar was crowned anyway');
}
console.log('   the recap names the choice without crowning it');

console.log('\n✅ the voting stage holds: ballot, count, change of mind, rules, and both endings');
process.exit(0);
