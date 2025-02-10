import { Unsubscribe } from 'firebase/auth';
import {
	collection,
	onSnapshot,
	query,
	where,
	doc,
	getDocs,
	getDoc,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { setEvaluationToStore } from '@/redux/evaluations/evaluationsSlice';
import { AppDispatch } from '@/redux/store';
import { Collections } from '@/types/enums';
import { UserSchema } from '@/types/user';
import { parse } from 'valibot';
import { Evaluation, EvaluationSchema } from '@/types/evaluation';

export const listenToEvaluations = (
	dispatch: AppDispatch,
	parentId: string,
	evaluatorId: string | undefined
): Unsubscribe => {
	try {
		const evaluationsRef = collection(FireStore, Collections.evaluations);

		if (!evaluatorId) throw new Error('User is undefined');

		const q = query(
			evaluationsRef,
			where('parentId', '==', parentId),
			where('evaluatorId', '==', evaluatorId)
		);

		return onSnapshot(q, (evaluationsDB) => {
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
		});
	} catch (error) {
		console.error(error);

		return () => { };
	}
};

export async function getEvaluations(parentId: string): Promise<Evaluation[]> {
	try {
		const evaluationsRef = collection(FireStore, Collections.evaluations);
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
					const evaluatorRef = doc(
						FireStore,
						Collections.users,
						evaluation.evaluatorId
					);
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
			const evaluator = evaluators.find(
				(evaluator) => evaluator?.uid === evaluation.evaluatorId
			);

			if (evaluator) evaluation.evaluator = evaluator;
		});

		return evaluations;
	} catch (error) {
		console.error(error);

		return [] as Evaluation[];
	}
}
