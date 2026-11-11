/**
 * Exposure simulation, triggers OFF: answers appear over the first part of the
 * session. Up to the threshold every person, on arrival, rates the first few of
 * the app's newest-30 query. Above it they rate the batches the server's own
 * sampler picks, as the Rate view does: `sampleAnswers` runs that sampler, with
 * the same inputs, in this process. The behaviour (arrival order, how many
 * cards a person rates) is a stated model.
 *
 * Also writes the denormalised counters the triggers would have produced, so
 * the rating burst later runs against a realistic question.
 */
import { getDocs } from 'firebase/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import {
	ANSWER_BATCH,
	Collections,
	getQuestionParticipationId,
	isAnswerBatchQuestion,
	StatementType,
} from '@freedi/shared-types';
import type { Creator, Statement } from '@freedi/shared-types';
import { WINDOW_SIZE } from './config';
import type { ScaleConfig } from './config';
import { answersWindowQuery } from './clients';
import type { SampleClient } from './clients';
import { BatchWriter, memberCreator, requireStatement } from './seed';
import type { Seeded } from './seed';
import { exposureStats } from './metrics';
import type { ExposureStats } from './metrics';
import { resetSampler, sampleAnswers } from './sampler';

/** Answers arrive across this share of the arriving people. */
const ANSWER_ARRIVAL_SHARE = 0.7;
export const RATING_VALUES = [1, 0.5, 0, -0.5, -1];
/** Fixed multiplier so a rerun rates identically. */
const RATING_STEP = 7;
const SECOND_MS = 1000;

export interface ExposureResult {
	stats: ExposureStats;
	/** Same arrival schedule, if each person rated all 30 cards they were shown. */
	ifRatedWholeWindow: ExposureStats;
	answers: Statement[];
	ratedBy: Map<string, Set<string>>;
	ratingsWritten: number;
}

export function makeAnswer(
	index: number,
	author: Creator,
	question: Statement,
	createdAt: number,
): Statement {
	return requireStatement(
		{
			statementId: `scale-a${String(index).padStart(5, '0')}`,
			statement: `Scale answer number ${index}`,
			statementType: StatementType.option,
			parentId: question.statementId,
			topParentId: question.topParentId,
			parents: [question.topParentId, question.statementId],
			creatorId: author.uid,
			creator: author,
		},
		{ createdAt, lastUpdate: createdAt },
	);
}

export function ratingDoc(user: Creator, answer: Statement, value: number): DocumentData {
	const evaluationId = `${user.uid}--${answer.statementId}`;

	return {
		parentId: answer.parentId,
		evaluationId,
		statementId: answer.statementId,
		evaluatorId: user.uid,
		updatedAt: Date.now(),
		evaluation: value,
		evaluator: user,
	};
}

function evaluationBlock(values: number[]): Record<string, number> {
	const sum = values.reduce((total, v) => total + v, 0);
	const pro = values.filter((v) => v > 0);
	const con = values.filter((v) => v < 0);
	const average = values.length === 0 ? 0 : sum / values.length;

	return {
		sumEvaluations: sum,
		agreement: average,
		numberOfEvaluators: values.length,
		sumPro: pro.reduce((total, v) => total + v, 0),
		sumCon: con.reduce((total, v) => total + Math.abs(v), 0),
		numberOfProEvaluators: pro.length,
		numberOfConEvaluators: con.length,
		sumSquaredEvaluations: values.reduce((total, v) => total + v * v, 0),
		averageEvaluation: average,
		evaluationRandomNumber: 0.5,
		viewed: values.length,
	};
}

export async function simulateExposure(
	seeded: Seeded,
	config: ScaleConfig,
	reader: SampleClient,
	startedAt: number,
): Promise<ExposureResult> {
	const { db, question, members } = seeded;
	const writer = new BatchWriter(db);
	const answers: Statement[] = [];
	const ratedBy = new Map<string, Set<string>>();
	const values = new Map<string, number[]>();
	const shownAll = new Map<string, number>();
	const query = answersWindowQuery(reader.db, question.statementId, WINDOW_SIZE);
	const answerSpan = Math.max(1, Math.floor(members.length * ANSWER_ARRIVAL_SHARE));
	resetSampler();

	/** The answers as the server would read them now, with this run's ratings. */
	const answersWithRatings = (): Statement[] =>
		answers.map((answer) => {
			const ratings = values.get(answer.statementId) ?? [];
			const evaluation = evaluationBlock(ratings);

			return {
				...answer,
				evaluation,
				consensus: evaluation.averageEvaluation,
				totalEvaluators: ratings.length,
			} as unknown as Statement;
		});

	/** One person's cards: batch by batch, rating every card before asking again. */
	const sampledCards = (uid: string): Set<string> => {
		const statements = answersWithRatings();
		const cards = new Set<string>();
		while (cards.size < config.ratingsPerMember) {
			const batch = sampleAnswers(statements, cards, uid, ANSWER_BATCH.DEFAULT_SIZE);
			if (batch.length === 0) break;
			batch.forEach((answer) => cards.add(answer.statementId));
		}

		return cards;
	};

	for (let i = 0; i < members.length; i += 1) {
		const target = Math.min(config.answers, Math.floor(((i + 1) * config.answers) / answerSpan));
		while (answers.length < target) {
			const index = answers.length;
			const author = memberCreator(`author${String(index).padStart(5, '0')}`);
			const answer = makeAnswer(index, author, question, startedAt + index * SECOND_MS);
			answers.push(answer);
			values.set(answer.statementId, []);
			writer.set(Collections.statements, answer.statementId, answer);
			writer.set(Collections.statementEmbeddings, answer.statementId, {
				statementId: answer.statementId,
				parentId: answer.parentId,
			});
		}
		await writer.flush();

		const member = members[i];
		const shownIds = isAnswerBatchQuestion(answers.length)
			? [...sampledCards(member.uid)]
			: (await getDocs(query)).docs.map((doc) => doc.id);
		shownIds.forEach((id) => shownAll.set(id, (shownAll.get(id) ?? 0) + 1));

		const rated = new Set<string>();
		for (const answerId of shownIds.slice(0, config.ratingsPerMember)) {
			const answer = answers.find((candidate) => candidate.statementId === answerId);
			if (!answer) continue;
			const value =
				RATING_VALUES[(i * RATING_STEP + answers.indexOf(answer)) % RATING_VALUES.length];
			values.get(answerId)?.push(value);
			rated.add(answerId);
			writer.set(
				Collections.evaluations,
				`${member.uid}--${answerId}`,
				ratingDoc(member, answer, value),
			);
		}
		ratedBy.set(member.uid, rated);
		await writer.flushIfFull();
	}

	const rated = answersWithRatings();
	for (const answer of rated) {
		writer.set(Collections.statements, answer.statementId, answer);
		await writer.flushIfFull();
	}
	for (const member of members) {
		if ((ratedBy.get(member.uid)?.size ?? 0) === 0) continue;
		writer.set(Collections.evaluationParticipants, `${question.statementId}--${member.uid}`, {
			parentId: question.statementId,
			userId: member.uid,
			createdAt: startedAt,
		});
		// The funnel's own marker: without it every burst rater counts as first-time.
		writer.set(
			Collections.questionParticipation,
			getQuestionParticipationId(question.statementId, member.uid),
			{ statementId: question.statementId, userId: member.uid, entered: true, evaluated: true },
		);
		await writer.flushIfFull();
	}
	const raters = members.filter((member) => (ratedBy.get(member.uid)?.size ?? 0) > 0).length;
	writer.set(Collections.statements, question.statementId, {
		...question,
		evaluation: { ...evaluationBlock([]), asParentTotalEvaluators: raters },
		totalEvaluators: raters,
		numberOfMembers: members.length,
		numberOfOptions: config.answers,
		viewed: { individualViews: members.length },
	});
	// What the progress writer would hold by now; the app's readers need it.
	const inOrder = answers.map((answer) => values.get(answer.statementId)?.length ?? 0);
	writer.set(Collections.questionProgress, question.statementId, {
		statementId: question.statementId,
		topParentId: question.topParentId,
		entered: members.length,
		suggested: config.answers,
		evaluated: raters,
		options: config.answers,
		evaluations: inOrder.reduce((total, n) => total + n, 0),
		members: members.length,
		lastActivity: startedAt,
		lastUpdate: startedAt,
	});
	await writer.flush();

	return {
		stats: exposureStats(inOrder),
		ifRatedWholeWindow: exposureStats(
			answers.map((answer) => shownAll.get(answer.statementId) ?? 0),
		),
		answers: rated,
		ratedBy,
		ratingsWritten: inOrder.reduce((total, n) => total + n, 0),
	};
}
