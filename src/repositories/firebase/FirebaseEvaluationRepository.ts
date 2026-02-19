/**
 * Firebase Evaluation Repository
 *
 * Firestore implementation of the IEvaluationRepository interface.
 * Uses existing utility functions for document references and error handling.
 */

import { getDoc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { Evaluation, Collections } from '@freedi/shared-types';
import { createEvaluationRef, createCollectionRef } from '@/utils/firebaseUtils';
import { logError, DatabaseError } from '@/utils/errorHandling';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
import type { IEvaluationRepository } from '../interfaces/IEvaluationRepository';

export class FirebaseEvaluationRepository implements IEvaluationRepository {
	async getById(id: string): Promise<Evaluation | undefined> {
		try {
			if (!id) {
				throw new DatabaseError('Evaluation ID is required', {
					operation: 'FirebaseEvaluationRepository.getById',
				});
			}

			const docRef = createEvaluationRef(id);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return undefined;
			}

			return convertTimestampsToMillis(docSnap.data()) as Evaluation;
		} catch (error) {
			logError(error, {
				operation: 'FirebaseEvaluationRepository.getById',
				metadata: { evaluationId: id },
			});

			return undefined;
		}
	}

	async save(evaluation: Evaluation): Promise<void> {
		try {
			if (!evaluation.evaluationId) {
				throw new DatabaseError('Evaluation must have an evaluationId', {
					operation: 'FirebaseEvaluationRepository.save',
				});
			}

			const docRef = createEvaluationRef(evaluation.evaluationId);
			await setDoc(docRef, evaluation);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseEvaluationRepository.save',
				metadata: { evaluationId: evaluation.evaluationId },
			});
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Evaluation ID is required for deletion', {
					operation: 'FirebaseEvaluationRepository.delete',
				});
			}

			const docRef = createEvaluationRef(id);
			await deleteDoc(docRef);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseEvaluationRepository.delete',
				metadata: { evaluationId: id },
			});
			throw error;
		}
	}

	async getByStatement(statementId: string): Promise<Evaluation[]> {
		try {
			if (!statementId) {
				throw new DatabaseError('Statement ID is required', {
					operation: 'FirebaseEvaluationRepository.getByStatement',
				});
			}

			const collectionRef = createCollectionRef(Collections.evaluations);
			const q = query(collectionRef, where('parentId', '==', statementId));
			const querySnap = await getDocs(q);

			return querySnap.docs.map((doc) => convertTimestampsToMillis(doc.data()) as Evaluation);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseEvaluationRepository.getByStatement',
				statementId,
			});

			return [];
		}
	}

	async getByUser(userId: string, statementId: string): Promise<Evaluation | undefined> {
		try {
			if (!userId || !statementId) {
				throw new DatabaseError('User ID and Statement ID are required', {
					operation: 'FirebaseEvaluationRepository.getByUser',
				});
			}

			const evaluationId = `${userId}--${statementId}`;
			const docRef = createEvaluationRef(evaluationId);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return undefined;
			}

			return convertTimestampsToMillis(docSnap.data()) as Evaluation;
		} catch (error) {
			logError(error, {
				operation: 'FirebaseEvaluationRepository.getByUser',
				userId,
				statementId,
			});

			return undefined;
		}
	}
}
