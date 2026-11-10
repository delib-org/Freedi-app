/**
 * The fixed set of baseline numbers, each labelled measured or derived. A later
 * rerun compares these keys.
 */
import { Collections } from '@freedi/shared-types';
import type { RunResult } from './baseline';
import type { PhaseCost } from './metrics';
import { fanOutReads, perUnit, scaleToPopulation } from './metrics';

type Phase = RunResult['phases'][number];
export const POPULATION = 1000;

function phaseOf(run: RunResult, name: string): Phase {
	const phase = run.phases.find((candidate) => candidate.name === name);
	if (!phase) throw new Error(`Phase ${name} missing from ${run.label}`);

	return phase;
}

export function round(value: number, digits = 1): number {
	const factor = 10 ** digits;

	return Math.round(value * factor) / factor;
}

/** Mean, across the sample clients, of documents delivered for one shape in one phase. */
export function meanDocsDelivered(run: RunResult, phase: string, shape: string): number {
	const counts = run.clients.map((client) => {
		const entry = client.counts[phase]?.[shape as keyof (typeof client.counts)[string]];

		return entry?.docs ?? 0;
	});

	return counts.reduce((sum, value) => sum + value, 0) / Math.max(counts.length, 1);
}

function meanSnapshots(run: RunResult, phase: string, shape: string): number {
	const counts = run.clients.map((client) => {
		const entry = client.counts[phase]?.[shape as keyof (typeof client.counts)[string]];

		return entry?.snapshots ?? 0;
	});

	return counts.reduce((sum, value) => sum + value, 0) / Math.max(counts.length, 1);
}

function delta(phase: Phase, collection: string): number {
	const name = collection as keyof Phase['countsAfter'];

	return phase.countsAfter[name] - phase.countsBefore[name];
}

export interface MetricRow {
	key: string;
	label: string;
	value: number;
	kind: 'measured' | 'derived';
	note?: string;
}

/** The fixed set of numbers a later rerun compares. */
export function metricsOf(run: RunResult): MetricRow[] {
	const rate = phaseOf(run, 'rate');
	const rateFirst = phaseOf(run, 'rate-first-time');
	const simultaneous = phaseOf(run, 'rate-simultaneous');
	const arrive = phaseOf(run, 'arrive');
	const view = phaseOf(run, 'view');
	const presence = phaseOf(run, 'presence');
	const answer = phaseOf(run, 'new-answer');
	const vote = phaseOf(run, 'vote');
	const answerBatch = phaseOf(run, 'answer-batch');
	const n = run.config.members;
	const open = (shape: string): number => round(meanDocsDelivered(run, 'open', shape));
	const openTotal =
		open('questionDoc') +
		open('subscriptionDoc') +
		open('myEvaluations') +
		open('answersHeadStart') +
		open('answersWindow') +
		open('presence') +
		open('participationRatings') +
		open('participationViewsCount') +
		open('questionProgress') +
		open('batchAnswers');
	const presenceDeliveredPerWrite = perUnit(
		meanDocsDelivered(run, 'presence', 'presence'),
		presence.units,
	);
	const answersDeliveredPerRating = perUnit(
		meanDocsDelivered(run, 'rate', 'answersWindow'),
		rate.units,
	);
	const questionDeliveredPerRating = perUnit(
		meanDocsDelivered(run, 'rate', 'questionDoc'),
		rate.units,
	);

	const rows: MetricRow[] = [
		{
			key: 'arrive.questionWrites',
			label: 'Question doc writes per arrival (subscribe)',
			value: round(perUnit(arrive.questionDocWrites, arrive.units), 2),
			kind: 'measured',
		},
		{
			key: 'view.questionWrites',
			label: 'Question doc writes per first view',
			value: round(perUnit(view.questionDocWrites, view.units), 2),
			kind: 'measured',
		},
		{
			key: 'rate.questionWrites',
			label: 'Question doc writes per rating (returning rater)',
			value: round(perUnit(rate.questionDocWrites, rate.units), 2),
			kind: 'measured',
		},
		{
			key: 'rateFirst.questionWrites',
			label: 'Question doc writes per first rating of a person',
			value: round(perUnit(rateFirst.questionDocWrites, rateFirst.units), 2),
			kind: 'measured',
		},
		{
			key: 'answer.questionWrites',
			label: 'Question doc writes per new answer',
			value: round(perUnit(answer.questionDocWrites, answer.units), 2),
			kind: 'measured',
		},
		{
			key: 'question.bytes',
			label: 'Question document size (bytes)',
			value: run.questionDocBytes,
			kind: 'measured',
		},
		{
			key: 'listeners.arrive',
			label: 'Snapshots each sample listener got per arrival',
			value: round(perUnit(meanSnapshots(run, 'arrive', 'questionDoc'), arrive.units), 2),
			kind: 'measured',
			note: `${run.config.sampleClients} real SDK listeners`,
		},
		{
			key: 'readsPerRating',
			label: 'Docs read by functions per rating',
			value: round(perUnit(rate.totalReads, rate.units), 1),
			kind: 'measured',
		},
		{
			key: 'readsPerRating.statements',
			label: '  of which answer/statement docs',
			value: round(perUnit(rate.readsByCollection[Collections.statements] ?? 0, rate.units), 1),
			kind: 'measured',
		},
		{
			key: 'writesPerRating',
			label: 'Docs written by functions per rating',
			value: round(perUnit(rate.totalWrites, rate.units), 1),
			kind: 'measured',
		},
		{
			key: 'adminStatsPerRating',
			label: 'Global adminStats doc writes per rating',
			value: round(perUnit(rate.writesByCollection[Collections.adminStats] ?? 0, rate.units), 2),
			kind: 'measured',
		},
		{
			key: 'writesPerVote',
			label: 'Docs written by functions per vote',
			value: round(perUnit(vote.totalWrites, vote.units), 1),
			kind: 'measured',
		},
		{
			key: 'optionWritesPerVote',
			label: 'Answer doc writes per vote (leader flag)',
			value: round(
				perUnit(
					(vote.writesByCollection[Collections.statements] ?? 0) - vote.questionDocWrites,
					vote.units,
				),
				2,
			),
			kind: 'measured',
		},
		{
			key: 'invocationsPerVote',
			label: 'Function invocations per vote',
			value: round(perUnit(vote.invocationsTotal, vote.units), 1),
			kind: 'measured',
		},
		{
			key: 'invocationsPerRating',
			label: 'Function invocations per rating',
			value: round(perUnit(rate.invocationsTotal, rate.units), 1),
			kind: 'measured',
		},
		{
			key: 'invocationsPerArrival',
			label: 'Function invocations per arrival',
			value: round(perUnit(arrive.invocationsTotal, arrive.units), 1),
			kind: 'measured',
		},
		{
			key: 'invocationsPerAnswer',
			label: 'Function invocations per new answer',
			value: round(perUnit(answer.invocationsTotal, answer.units), 1),
			kind: 'measured',
		},
		{
			key: 'open.answers',
			label: 'Open: answers (head start + newest 30)',
			value: open('answersHeadStart') + open('answersWindow'),
			kind: 'measured',
		},
		{
			key: 'open.presence',
			label: 'Open: presence docs',
			value: open('presence'),
			kind: 'measured',
		},
		{
			key: 'open.ratings',
			label: 'Open: all ratings (useParticipationStats)',
			value: open('participationRatings'),
			kind: 'measured',
		},
		{
			key: 'open.progress',
			label: 'Open: question progress doc (one read, also for hosts)',
			value: open('questionProgress'),
			kind: 'measured',
		},
		{
			key: 'open.batchAnswers',
			label: 'Open: Rate view batch, live copy of the cards on screen',
			value: open('batchAnswers'),
			kind: 'measured',
		},
		{
			key: 'open.total',
			label: 'Open: total docs per participant',
			value: round(openTotal),
			kind: 'measured',
		},
		{
			key: 'open.perPeople',
			label: `Open: all ${POPULATION} participants`,
			value: round(scaleToPopulation(openTotal, POPULATION)),
			kind: 'derived',
			note: 'sampled per-participant x 1,000',
		},
		{
			key: 'open.answerBatch',
			label: 'Answers returned per getAnswerBatch call (function reads, not client reads)',
			value: open('answerBatch'),
			kind: 'measured',
			note: 'not included in the open total',
		},
		{
			key: 'batch.readsPerCall',
			label: 'Docs read by functions per getAnswerBatch call',
			value: round(perUnit(answerBatch.totalReads, answerBatch.units), 1),
			kind: 'measured',
			note: 'per-instance answer cache; workers on one machine',
		},
		{
			key: 'ranked.topPage',
			label: 'Ranked list: docs read for the first page',
			value: round(meanDocsDelivered(run, 'ranked-list', 'rankedTopPage')),
			kind: 'measured',
			note: 'replaces downloading every answer; no listener',
		},
		{
			key: 'presence.delivered',
			label: 'Presence docs delivered per listener per presence write',
			value: round(presenceDeliveredPerWrite, 2),
			kind: 'measured',
		},
		{
			key: 'presence.fanOutOneWrite',
			label: `Reads when one person's presence changes (${n} listening)`,
			value: fanOutReads(1, n),
			kind: 'derived',
			note: 'measured 1:1 delivery x listeners',
		},
		{
			key: 'presence.arrivalAll',
			label: `Reads when all ${POPULATION} arrive, presence on`,
			value: fanOutReads(POPULATION, POPULATION),
			kind: 'derived',
			note: 'each arrival delivered to all present',
		},
		{
			key: 'rate.answersDelivered',
			label: 'Answer-window docs delivered per listener per rating',
			value: round(answersDeliveredPerRating, 2),
			kind: 'measured',
		},
		{
			key: 'rate.fanOutReads',
			label: `Reads per rating to ${n} open windows`,
			value: round(fanOutReads(answersDeliveredPerRating + questionDeliveredPerRating, n)),
			kind: 'derived',
			note: 'delivered per listener x listeners',
		},
		{
			key: 'rate.notificationQueueWrites',
			label: 'Notification queue writes per rating',
			value: round(
				perUnit(rate.writesByCollection[Collections.notificationQueue] ?? 0, rate.units),
				2,
			),
			kind: 'measured',
			note: 'notices to the author of a rated answer',
		},
		{
			key: 'triggers.perStatementWrite',
			label: 'Functions started by one write to any statement doc',
			value: triggersPerStatementWrite(rate),
			kind: 'measured',
			note: 'functions invoked once per statements write in the rate phase',
		},
		{
			key: 'event.questionFanOut',
			label: `Reads from question doc writes as ${POPULATION} people arrive and view`,
			value: round(
				(perUnit(arrive.questionDocWrites, arrive.units) +
					perUnit(view.questionDocWrites, view.units)) *
					POPULATION *
					(POPULATION / 2),
			),
			kind: 'derived',
			note: 'writes x people x average of N/2 already listening',
		},
		{
			key: 'event.ratingListenerReads',
			label: `Listener reads for ${POPULATION * run.config.ratingsPerMember} ratings (question doc + answer window)`,
			value: round(
				(answersDeliveredPerRating + questionDeliveredPerRating) *
					POPULATION *
					run.config.ratingsPerMember *
					(POPULATION / 2),
			),
			kind: 'derived',
			note: 'delivered per listener per rating x ratings x average of N/2 people present; ratings on answers outside the window deliver no answer doc',
		},
		{
			key: 'event.ratingFunctionReads',
			label: `Function doc reads for ${POPULATION * run.config.ratingsPerMember} ratings`,
			value: round(perUnit(rate.totalReads, rate.units) * POPULATION * run.config.ratingsPerMember),
			kind: 'derived',
			note: 'reads per rating x ratings',
		},
		{
			key: 'exposure.rated',
			label: 'Answers rated at all',
			value: run.exposure.stats.ratedAnswers,
			kind: 'measured',
			note: `of ${run.exposure.stats.totalAnswers}; model: the sampler's batches, ${run.config.ratingsPerMember} ratings each`,
		},
		{
			key: 'exposure.oldestQuarter',
			label: 'Mean ratings per answer, oldest quarter',
			value: run.exposure.stats.meanByAgeQuarter[0],
			kind: 'measured',
			note: 'query is real; arrival model stated',
		},
		{
			key: 'exposure.newestQuarter',
			label: 'Mean ratings per answer, newest quarter',
			value: run.exposure.stats.meanByAgeQuarter[3],
			kind: 'measured',
			note: 'query is real; arrival model stated',
		},
		{
			key: 'exposure.topTenthShare',
			label: 'Share of ratings on the most-rated 10% of answers',
			value: run.exposure.stats.topTenthShare,
			kind: 'measured',
		},
		{
			key: 'fanOut.writesPerAnswer',
			label: 'In-app notification writes per new answer',
			value: round(perUnit(delta(answer, Collections.inAppNotifications), answer.units)),
			kind: 'measured',
			note: `${run.config.members + run.config.sampleClients + run.config.burst.arrivals} subscribers`,
		},
		{
			key: 'credits.rate',
			label: 'Credit ledger docs per rating (paced)',
			value: round(perUnit(delta(rate, Collections.creditLedger), rate.units), 2),
			kind: 'measured',
		},
		{
			key: 'credits.simultaneous',
			label: 'Credit ledger docs per rating (simultaneous)',
			value: round(perUnit(delta(simultaneous, Collections.creditLedger), simultaneous.units), 2),
			kind: 'measured',
		},
		{
			key: 'credits.afterReturn',
			label: 'Share of credit-ledger writes landing after the trigger returned',
			value: round(
				perUnit(
					rate.writesAfterReturn[Collections.creditLedger] ?? 0,
					rate.writesByCollection[Collections.creditLedger] ?? 0,
				),
				2,
			),
			kind: 'measured',
			note: 'at risk in production when instances freeze',
		},
		{
			key: 'rate.fnP95Ms',
			label: 'newEvaluation duration p95 (ms, local)',
			value: rate.byFunction.newEvaluation?.p95Ms ?? 0,
			kind: 'measured',
			note: 'local only; not comparable to production',
		},
	];

	return rows;
}

/** How many functions ran exactly once per write to a statement document. */
export function triggersPerStatementWrite(phase: PhaseCost): number {
	const statementWrites = phase.writesByCollection[Collections.statements] ?? 0;
	if (statementWrites === 0) return 0;

	return Object.values(phase.byFunction).filter((cost) => cost.invocations === statementWrites)
		.length;
}
