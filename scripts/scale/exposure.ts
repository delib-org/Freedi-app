/**
 * Exposure simulation, triggers OFF: answers appear over the first part of the
 * session, and every person, on arrival, asks the emulator the app's own query
 * for the newest 30 answers and rates the first few it returns. The query is
 * real; the behaviour (arrival order, how many cards a person rates, no
 * scrolling) is a stated model.
 *
 * Also writes the denormalised counters the triggers would have produced, so
 * the rating burst later runs against a realistic question.
 */
import { getDocs } from 'firebase/firestore';
import type { DocumentData } from 'firebase-admin/firestore';
import { Collections, getQuestionParticipationId, StatementType } from '@freedi/shared-types';
import type { Creator, Statement } from '@freedi/shared-types';
import { WINDOW_SIZE } from './config';
import type { ScaleConfig } from './config';
import { answersWindowQuery } from './clients';
import type { SampleClient } from './clients';
import { BatchWriter, memberCreator, requireStatement } from './seed';
import type { Seeded } from './seed';
import { exposureStats } from './metrics';
import type { ExposureStats } from './metrics';

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

		const window = await getDocs(query);
		const windowIds = window.docs.map((doc) => doc.id);
		windowIds.forEach((id) => shownAll.set(id, (shownAll.get(id) ?? 0) + 1));

		const member = members[i];
		const rated = new Set<string>();
		for (const answerId of windowIds.slice(0, config.ratingsPerMember)) {
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

	for (const answer of answers) {
		const ratings = values.get(answer.statementId) ?? [];
		const consensus = evaluationBlock(ratings).averageEvaluation;
		writer.set(Collections.statements, answer.statementId, {
			...answer,
			evaluation: evaluationBlock(ratings),
			consensus,
			totalEvaluators: ratings.length,
		});
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
	await writer.flush();

	const inOrder = answers.map((answer) => values.get(answer.statementId)?.length ?? 0);

	return {
		stats: exposureStats(inOrder),
		ifRatedWholeWindow: exposureStats(
			answers.map((answer) => shownAll.get(answer.statementId) ?? 0),
		),
		answers,
		ratedBy,
		ratingsWritten: inOrder.reduce((total, n) => total + n, 0),
	};
}
