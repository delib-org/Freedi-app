import { getDocs, query, where } from 'firebase/firestore';
import { Collections, UserDemographicQuestion } from '@freedi/shared-types';
import { FIREBASE } from '@/constants/common';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { DatabaseError, logError } from '@/utils/errorHandling';

const OPERATION = 'userDemographic.getInheritedDemographicAnswers';

/**
 * The answers this space's members gave to the group questions it inherits.
 * An answer is stored on the space that asks the question (the group), so a
 * query by this space's id misses them. To keep reads to what the Entry check
 * shows, it reads this space's subscriptions once, then only those members'
 * answers on each source space — never the whole group's.
 */
export async function getInheritedDemographicAnswers(
	statementId: string,
	inheritedQuestions: ReadonlyArray<UserDemographicQuestion>,
): Promise<UserDemographicQuestion[]> {
	if (inheritedQuestions.length === 0) return [];
	try {
		const memberIds = await getMemberIds(statementId);
		if (memberIds.length === 0) return [];

		const askedIds = new Set(inheritedQuestions.map((q) => q.userQuestionId));
		const sourceIds = [...new Set(inheritedQuestions.map((q) => q.statementId))];
		const answers = await Promise.all(
			sourceIds.flatMap((sourceId) =>
				chunk(memberIds, FIREBASE.IN_QUERY_LIMIT).map((ids) => getAnswersOn(sourceId, ids)),
			),
		);

		return answers.flat().filter((answer) => askedIds.has(answer.userQuestionId));
	} catch (error) {
		logError(error, { operation: OPERATION, statementId });
		throw new DatabaseError('Could not load answers to inherited questions', {
			operation: OPERATION,
			statementId,
		});
	}
}

async function getMemberIds(statementId: string): Promise<string[]> {
	const snapshot = await getDocs(
		query(
			createCollectionRef(Collections.statementsSubscribe),
			where('statementId', '==', statementId),
		),
	);
	const ids = snapshot.docs
		.map((doc) => doc.data().userId)
		.filter((id): id is string => typeof id === 'string' && id !== '');

	return [...new Set(ids)];
}

async function getAnswersOn(
	sourceId: string,
	userIds: ReadonlyArray<string>,
): Promise<UserDemographicQuestion[]> {
	const snapshot = await getDocs(
		query(
			createCollectionRef(Collections.usersData),
			where('statementId', '==', sourceId),
			where('userId', 'in', userIds),
		),
	);

	return snapshot.docs.map((doc) => doc.data() as UserDemographicQuestion);
}

export function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));

	return chunks;
}
