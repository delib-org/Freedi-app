import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { Statement } from '@/types/statement/Statement';
import { number, parse } from 'valibot';
import { Collections } from '@/types/TypeEnums';
import { EvaluationSchema } from '@/types/evaluation/Evaluation';

export async function setEvaluationToDB(
	statement: Statement,
	evaluation: number
): Promise<void> {
	try {
		parse(number(), evaluation);

		if (evaluation < -1 || evaluation > 1)
			throw new Error('Evaluation is not in range');

		//ids
		const parentId = statement.parentId;
		if (!parentId) throw new Error('ParentId is undefined');

		const statementId = statement.statementId;
		const user = store.getState().user.user;

		const userId = user?.uid;
		if (!userId) throw new Error('User is undefined');
		const evaluationId = `${userId}--${statementId}`;

		//set evaluation to db

		const evaluationRef = doc(
			FireStore,
			Collections.evaluations,
			evaluationId
		);
		const evaluationData = {
			parentId,
			evaluationId,
			statementId,
			evaluatorId: userId,
			updatedAt: Timestamp.now().toMillis(),
			evaluation,
			evaluator: user,
		};

		parse(EvaluationSchema, evaluationData);

		await setDoc(evaluationRef, evaluationData);
	} catch (error) {
		console.error(error);
	}
}
