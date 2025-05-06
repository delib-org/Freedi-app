import { Timestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { number, parse } from 'valibot';
import { EvaluationSchema, Collections, Statement, User, EvaluationUI } from 'delib-npm';

export async function setEvaluationToDB(
	statement: Statement,
	creator: User,
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

export function setEvaluationUIType(statementId: string, evaluationUI: EvaluationUI) {

	const evaluationUIRef = doc(FireStore, Collections.statements, statementId);
	updateDoc(evaluationUIRef, { evaluationSettings: { evaluationUI: evaluationUI } }).catch(error => {
		console.error('Error updating evaluation UI:', error);
	});

	return evaluationUIRef;
};
