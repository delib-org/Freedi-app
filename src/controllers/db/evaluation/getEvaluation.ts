import { Unsubscribe } from 'firebase/auth';
import { query, where, getDocs, getDoc } from 'firebase/firestore';
import { setEvaluationToStore } from '@/redux/evaluations/evaluationsSlice';
import { AppDispatch, store } from '@/redux/store';
import { parse } from 'valibot';
import {
	Evaluation,
	EvaluationSchema,
	SelectionFunction,
	Collections,
	UserSchema,
} from '@freedi/shared-types';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	createManagedCollectionListener,
	createManagedDocumentListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';
import { createCollectionRef, createEvaluationRef, createDocRef } from '@/utils/firebaseUtils';

export const listenToEvaluations = (
	parentId: string,
	selectionFunction?: SelectionFunction,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch as AppDispatch;
		const evaluationsRef = createCollectionRef(Collections.evaluations);
		const user = store.getState().creator.creator;

		if (!user) throw new Error('User is undefined');
		const evaluatorId = user.uid;

		const q = selectionFunction
			? query(
					evaluationsRef,
					where('parentId', '==', parentId),
					where('evaluatorId', '==', evaluatorId),
					where('evaluation.selectionFunction', '==', selectionFunction),
				)
			: query(
					evaluationsRef,
					where('parentId', '==', parentId),
					where('evaluatorId', '==', evaluatorId),
				);

		// Generate unique key for this listener
		const listenerKey = generateListenerKey(
			'evaluations',
			'statement',
			`${parentId}-${evaluatorId}-${selectionFunction || 'all'}`,
		);

		// Use managed listener system
		return createManagedCollectionListener(
			q,
			listenerKey,
			(evaluationsDB) => {
				try {
					evaluationsDB.forEach((evaluationDB) => {
						try {
							const evaluation = parse(EvaluationSchema, evaluationDB.data());

							dispatch(setEvaluationToStore(evaluation));
						} catch (error) {
							console.error(error);
						}
					});
				} catch (error) {
					console.error(error);
				}
			},
			(error) => console.error('Error in evaluations listener:', error),
			'query',
		);
	} catch (error) {
		console.error(error);

		return () => {};
	}
};

export function listenToEvaluation(statementId: string, userId: string): () => void {
	try {
		const evaluationId = getStatementSubscriptionId(statementId, userId);

		const evaluationsRef = createEvaluationRef(evaluationId);

		// Generate unique key for this listener
		const listenerKey = generateListenerKey('evaluation', 'single', evaluationId);

		// Use managed listener system
		return createManagedDocumentListener(
			evaluationsRef,
			listenerKey,
			(evaluationDB) => {
				try {
					if (!evaluationDB.exists()) return;
					const evaluation = parse(EvaluationSchema, evaluationDB.data());

					store.dispatch(setEvaluationToStore(evaluation));
				} catch (error) {
					console.error(error);
				}
			},
			(error) => console.error('Error in evaluation listener:', error),
		);
	} catch (error) {
		console.error(error);

		return () => {
			return;
		};
	}
}

export async function getEvaluations(parentId: string): Promise<Evaluation[]> {
	try {
		const evaluationsRef = createCollectionRef(Collections.evaluations);
		const q = query(evaluationsRef, where('parentId', '==', parentId));

		const evaluationsDB = await getDocs(q);
		const evaluatorsIds = new Set<string>();
		const evaluations = evaluationsDB.docs
			.map((evaluationDB) => {
				const evaluation = parse(EvaluationSchema, evaluationDB.data());

				if (!evaluatorsIds.has(evaluation.evaluatorId)) {
					//prevent duplicate evaluators
					evaluatorsIds.add(evaluation.evaluatorId);

					return evaluation;
				}
			})
			.filter((evaluation) => evaluation) as Evaluation[];

		//get evaluators details if not already in db
		const evaluatorsPromise = evaluations
			.map((evaluation) => {
				if (!evaluation.evaluator) {
					const evaluatorRef = createDocRef(Collections.users, evaluation.evaluatorId);
					const promise = getDoc(evaluatorRef);

					return promise;
				}
			})
			.filter((promise) => promise);

		const evaluatorsDB = await Promise.all(evaluatorsPromise);
		const evaluators = evaluatorsDB.map((evaluatorDB) => {
			const evaluator = parse(UserSchema, evaluatorDB?.data());

			return evaluator;
		});

		evaluations.forEach((evaluation) => {
			const evaluator = evaluators.find((evaluator) => evaluator?.uid === evaluation.evaluatorId);

			if (evaluator) evaluation.evaluator = evaluator;
		});

		return evaluations;
	} catch (error) {
		console.error(error);

		return [] as Evaluation[];
	}
}
