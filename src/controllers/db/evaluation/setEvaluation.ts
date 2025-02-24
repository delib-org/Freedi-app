import { Timestamp, doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Statement } from '@/types/statement/Statement';
import { number, parse } from 'valibot';
import { Collections } from '@/types/TypeEnums';
import { EvaluationSchema } from '@/types/evaluation/Evaluation';
import { Creator } from '@/types/user/User';

export async function setEvaluationToDB(
	statement: Statement,
	creator: Creator,
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

		const evaluationId = `${creator.uid}--${statementId}`;

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
			evaluatorId: creator.uid,
			updatedAt: Timestamp.now().toMillis(),
			evaluation,
			evaluator: creator,
		};

		parse(EvaluationSchema, evaluationData);

		await setDoc(evaluationRef, evaluationData);
	} catch (error) {
		console.error(error);
	}
}
