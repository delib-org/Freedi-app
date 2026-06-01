/**
 * Strategic export — Firestore loaders scoped strictly to a single question.
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementType,
	UserDemographicQuestion,
} from '@freedi/shared-types';

/** A topic-cluster grouping derived directly from sibling cluster Statements. */
export interface TopicClusterGrouping {
	clusterId: string;
	clusterName: string;
	optionIds: string[];
}

/** Fetch the question Statement and verify it is StatementType.question. */
export async function loadQuestion(questionStatementId: string): Promise<Statement> {
	const db = getFirestore();
	const doc = await db.collection(Collections.statements).doc(questionStatementId).get();
	if (!doc.exists) {
		throw new Error(`Question statement not found: ${questionStatementId}`);
	}
	const statement = doc.data() as Statement;
	if (statement.statementType !== StatementType.question) {
		throw new Error(
			`Strategic export only works on questions. Got statementType=${statement.statementType} for ${questionStatementId}`,
		);
	}

	return statement;
}

/**
 * Load every direct child of the question. The topic-cluster pipeline keeps
 * options parented to the question (no reparenting), so this returns:
 *   - aggregated-suggestion clusters (isCluster === true)
 *   - regular options (isCluster !== true, statementType === option)
 *   - synthetic options created by the pipeline (also direct children)
 */
export async function loadDirectChildren(questionStatementId: string): Promise<Statement[]> {
	const db = getFirestore();
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionStatementId)
		.get();

	return snap.docs.map((d) => d.data() as Statement);
}

/**
 * Load the topic-cluster groupings for this question directly from sibling
 * cluster Statements (parentId === questionId && isCluster === true).
 * Membership comes from each cluster's `integratedOptions`; the cluster's
 * `statement` is used as the group name. Returns an empty array when the
 * pipeline has not yet produced any clusters.
 */
export async function loadTopicClusterGroupings(
	questionStatementId: string,
): Promise<TopicClusterGrouping[]> {
	const db = getFirestore();
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionStatementId)
		.where('isCluster', '==', true)
		.get();

	return snap.docs.map((d) => {
		const cluster = d.data() as Statement;

		return {
			clusterId: cluster.statementId,
			clusterName: cluster.statement,
			optionIds: cluster.integratedOptions ?? [],
		};
	});
}

/**
 * Load demographic questions that apply to this question:
 *   - questions whose statementId === questionStatementId, OR
 *   - questions inherited from the question's topParentId at scope='group'
 */
export async function loadDemographicQuestions(
	question: Statement,
): Promise<UserDemographicQuestion[]> {
	const db = getFirestore();
	const out: UserDemographicQuestion[] = [];

	// Per-statement questions
	const perStatement = await db
		.collection(Collections.userDemographicQuestions)
		.where('statementId', '==', question.statementId)
		.get();
	perStatement.docs.forEach((d) => out.push(d.data() as UserDemographicQuestion));

	// Inherited group-level questions (scope === 'group')
	if (question.topParentId && question.topParentId !== question.statementId) {
		const group = await db
			.collection(Collections.userDemographicQuestions)
			.where('topParentId', '==', question.topParentId)
			.where('scope', '==', 'group')
			.get();
		group.docs.forEach((d) => {
			const q = d.data() as UserDemographicQuestion;
			// Avoid duplicates if a question is both per-statement and inherited.
			if (!out.some((existing) => existing.userQuestionId === q.userQuestionId)) {
				out.push(q);
			}
		});
	}

	return out;
}

/**
 * For a set of evaluator user IDs and a list of demographic questions, fetch
 * each user's answer per question. Returns a map: userId → (userQuestionId → answer string).
 *
 * The `usersData` collection holds answers; an answer can be a plain string
 * (`answer`) or an array (`answerOptions`). We normalize to a single label
 * string ("opt1, opt2" for arrays).
 */
export async function loadDemographicAnswers(
	userIds: string[],
	demographicQuestions: UserDemographicQuestion[],
): Promise<Map<string, Map<string, string>>> {
	const db = getFirestore();
	const result = new Map<string, Map<string, string>>();
	if (userIds.length === 0 || demographicQuestions.length === 0) return result;

	const questionIds = demographicQuestions
		.map((q) => q.userQuestionId)
		.filter((id): id is string => Boolean(id));
	if (questionIds.length === 0) return result;

	const BATCH = 30; // Firestore 'in' max
	for (let i = 0; i < userIds.length; i += BATCH) {
		const userBatch = userIds.slice(i, i + BATCH);
		const snap = await db.collection(Collections.usersData).where('userId', 'in', userBatch).get();
		snap.docs.forEach((doc) => {
			const data = doc.data() as {
				userId?: string;
				userQuestionId?: string;
				answer?: string;
				answerOptions?: string[];
			};
			if (!data.userId || !data.userQuestionId) return;
			if (!questionIds.includes(data.userQuestionId)) return;
			const answer = normalizeAnswer(data.answer, data.answerOptions);
			if (!answer) return;
			let perUser = result.get(data.userId);
			if (!perUser) {
				perUser = new Map();
				result.set(data.userId, perUser);
			}
			perUser.set(data.userQuestionId, answer);
		});
	}

	return result;
}

function normalizeAnswer(answer: string | undefined, options: string[] | undefined): string | null {
	if (Array.isArray(options) && options.length > 0) {
		return options.slice().sort().join(', ');
	}
	if (typeof answer === 'string' && answer.trim()) {
		return answer.trim();
	}

	return null;
}
