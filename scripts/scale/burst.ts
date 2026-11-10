/**
 * The measured phases, triggers ON. Each phase performs one kind of action and
 * is paced so the emulator's backlog does not swamp the numbers: a small batch
 * of writes, then wait until the functions emulator is quiet.
 */
import { Collections, getVoteId } from '@freedi/shared-types';
import type { Creator, Statement } from '@freedi/shared-types';
import type { DocumentData } from 'firebase-admin/firestore';
import { WINDOW_SIZE, PACED_BATCH } from './config';
import type { ScaleConfig } from './config';
import { makeAnswer, RATING_VALUES, ratingDoc } from './exposure';
import type { SampleClient } from './clients';
import { memberCreator, presenceDoc, QUESTION_ID, subscriptionFor, TOP_ID, viewDoc } from './seed';
import type { Seeded } from './seed';
import type { TraceTail } from './trace';
import type { PhaseWindow } from './metrics';

const COUNTED_COLLECTIONS = [
	Collections.creditLedger,
	Collections.inAppNotifications,
	Collections.evaluationParticipants,
	Collections.userEngagement,
] as const;
type Counted = (typeof COUNTED_COLLECTIONS)[number];
export type CollectionCounts = Record<Counted, number>;

/** Long enough for a cold worker to load the functions bundle and pick up queued events. */
const QUIET_END_OF_PHASE_MS = 15_000;
/** Each of these must have run once before any phase is measured. */
const WARMUP_FUNCTIONS = [
	'newEvaluation',
	'onStatementCreated',
	'updateStatementWithViews',
	'onSubscriptionCreatedMembership',
	'addVote',
];
const WARMUP_PARALLEL = PACED_BATCH;
const NEW_ANSWER_INDEX_START = 100_000;
/** Newly arrived participants who rate once in the first-time rating phase. */
const FIRST_TIME_RATERS = 30;
/** Vote pattern: this many of every ten votes go to the leader, the rest spread out. */
const LEADER_VOTES_PER_TEN = 7;
const VOTE_PATTERN_LENGTH = 10;
const BALLOT_SIZE = 5;

export interface PhaseRecord extends PhaseWindow {
	countsBefore: CollectionCounts;
	countsAfter: CollectionCounts;
}

export interface BurstInput {
	seeded: Seeded;
	config: ScaleConfig;
	answers: Statement[];
	ratedBy: Map<string, Set<string>>;
	clients: SampleClient[];
	trace: TraceTail;
}

async function countAll(seeded: Seeded): Promise<CollectionCounts> {
	const entries = await Promise.all(
		COUNTED_COLLECTIONS.map(async (name): Promise<[Counted, number]> => {
			const snapshot = await seeded.db.collection(name).count().get();

			return [name, snapshot.data().count];
		}),
	);

	return Object.fromEntries(entries) as CollectionCounts;
}

async function paced<T>(
	items: T[],
	batchSize: number,
	trace: TraceTail,
	action: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
	for (let start = 0; start < items.length; start += batchSize) {
		const chunk = items.slice(start, start + batchSize);
		await Promise.all(chunk.map((item, index) => action(item, start + index)));
		await trace.waitSettled();
	}
}

/**
 * Pick an answer from the newest window this person has not rated yet, rotating
 * by rater so a burst spreads across the window instead of landing on one card.
 */
function nextUnrated(
	user: Creator,
	window: Statement[],
	ratedBy: Map<string, Set<string>>,
	offset: number,
): Statement {
	const rated = ratedBy.get(user.uid) ?? new Set<string>();
	const rotated = [
		...window.slice(offset % window.length),
		...window.slice(0, offset % window.length),
	];
	const answer = rotated.find((candidate) => !rated.has(candidate.statementId));
	if (!answer) throw new Error(`No unrated answer left in the window for ${user.uid}`);
	rated.add(answer.statementId);
	ratedBy.set(user.uid, rated);

	return answer;
}

/** Most votes go to one answer, so the leader rarely changes, as in a real ballot. */
function voteTarget(index: number, ballot: Statement[]): Statement {
	const slot = index % VOTE_PATTERN_LENGTH;
	if (slot < LEADER_VOTES_PER_TEN) return ballot[0];

	return ballot[1 + (slot % (ballot.length - 1))];
}

export async function runBurst(input: BurstInput): Promise<PhaseRecord[]> {
	const { seeded, config, answers, ratedBy, clients, trace } = input;
	const { db, question } = seeded;
	const newestWindow = answers.slice(-WINDOW_SIZE);
	const arrivals = Array.from({ length: config.burst.arrivals }, (_, i) =>
		memberCreator(`arrival${String(i).padStart(5, '0')}`),
	);
	const records: PhaseRecord[] = [];

	const setDoc = (collection: string, id: string, data: DocumentData): Promise<unknown> =>
		db.collection(collection).doc(id).set(data);
	const subscribe = (user: Creator): Promise<unknown> =>
		setDoc(
			Collections.statementsSubscribe,
			`${user.uid}--${QUESTION_ID}`,
			subscriptionFor(user, question),
		);
	const view = (user: Creator): Promise<unknown> =>
		setDoc(
			Collections.statementViews,
			`${user.uid}--${QUESTION_ID}`,
			viewDoc(user.uid, QUESTION_ID, TOP_ID),
		);
	const rate = (user: Creator, answer: Statement, index: number): Promise<unknown> =>
		setDoc(
			Collections.evaluations,
			`${user.uid}--${answer.statementId}`,
			ratingDoc(user, answer, RATING_VALUES[index % RATING_VALUES.length]),
		);

	const vote = (user: Creator, option: Statement): Promise<unknown> => {
		const now = Date.now();
		const voteId = getVoteId(user.uid, QUESTION_ID);

		return setDoc(Collections.votes, voteId, {
			voteId,
			statementId: option.statementId,
			parentId: QUESTION_ID,
			userId: user.uid,
			createdAt: now,
			lastUpdate: now,
		});
	};

	async function runPhase(name: string, units: number, work: () => Promise<void>): Promise<void> {
		if (config.onlyPhases.length > 0 && !config.onlyPhases.includes(name)) return;
		const countsBefore = await countAll(seeded);
		clients.forEach((client) => client.setPhase(name));
		const from = Date.now();
		await work();
		await trace.waitSettled(QUIET_END_OF_PHASE_MS);
		const to = Date.now();
		clients.forEach((client) => client.setPhase('idle'));
		records.push({ name, from, to, units, countsBefore, countsAfter: await countAll(seeded) });
		console.info(`[scale] phase ${name}: ${units} units, ${Math.round((to - from) / 1000)}s`);
	}

	// Warm-up: spins up a worker per trigger, so cold loads do not pollute the numbers.
	// Several in parallel, so more than one worker per trigger exists before measuring.
	clients.forEach((client) => client.setPhase('warmup'));
	const warmAnswerTarget = answers[answers.length - 1];
	const warmUsers = Array.from({ length: WARMUP_PARALLEL }, (_, i) => memberCreator(`warmup${i}`));
	await Promise.all(
		warmUsers.flatMap((user) => [
			subscribe(user),
			view(user),
			rate(user, warmAnswerTarget, 0),
			setDoc(Collections.online, `${user.uid}--${QUESTION_ID}`, presenceDoc(user, QUESTION_ID)),
			vote(user, warmAnswerTarget),
		]),
	);
	const warmAnswer = makeAnswer(NEW_ANSWER_INDEX_START, warmUsers[0], question, Date.now());
	await setDoc(Collections.statements, warmAnswer.statementId, warmAnswer);
	await trace.waitForFunctions(WARMUP_FUNCTIONS);
	await trace.waitSettled(QUIET_END_OF_PHASE_MS);
	warmUsers.forEach((user) => ratedBy.set(user.uid, new Set([warmAnswerTarget.statementId])));
	console.info(`[scale] warmed up, ${trace.invocations} invocations so far`);

	await runPhase('arrive', arrivals.length, () =>
		paced(arrivals, PACED_BATCH, trace, (user) => subscribe(user)),
	);
	await runPhase('view', config.burst.views, () =>
		paced(arrivals.slice(0, config.burst.views), PACED_BATCH, trace, (user) => view(user)),
	);
	await runPhase('presence', config.burst.presence, () =>
		paced(arrivals.slice(0, config.burst.presence), PACED_BATCH, trace, (user) =>
			setDoc(Collections.online, `${user.uid}--${QUESTION_ID}`, presenceDoc(user, QUESTION_ID)),
		),
	);
	await runPhase('rate', config.burst.ratings, () =>
		paced(seeded.members.slice(0, config.burst.ratings), PACED_BATCH, trace, (user, i) =>
			rate(user, nextUnrated(user, newestWindow, ratedBy, i), i),
		),
	);
	await runPhase('rate-first-time', FIRST_TIME_RATERS, () =>
		paced(arrivals.slice(0, FIRST_TIME_RATERS), PACED_BATCH, trace, (user, i) =>
			rate(user, nextUnrated(user, newestWindow, ratedBy, i), i),
		),
	);
	await runPhase('rate-simultaneous', config.burst.simultaneousRatings, async () => {
		const raters = seeded.members.slice(
			config.burst.ratings,
			config.burst.ratings + config.burst.simultaneousRatings,
		);
		await Promise.all(
			raters.map((user, i) => rate(user, nextUnrated(user, newestWindow, ratedBy, i), i)),
		);
	});
	await runPhase('new-answer', config.burst.newAnswers, () =>
		paced(
			Array.from({ length: config.burst.newAnswers }, (_, i) => i),
			1,
			trace,
			(i) => {
				const author = memberCreator(`newauthor${i}`);
				const answer = makeAnswer(NEW_ANSWER_INDEX_START + i + 1, author, question, Date.now());

				return setDoc(Collections.statements, answer.statementId, answer);
			},
		),
	);
	const ballot = newestWindow.slice(0, BALLOT_SIZE);
	await runPhase('vote', config.burst.votes, () =>
		paced(seeded.members.slice(0, config.burst.votes), PACED_BATCH, trace, (user, i) =>
			vote(user, voteTarget(i, ballot)),
		),
	);

	return records;
}
