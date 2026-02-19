/**
 * Firebase Vote Repository
 *
 * Firestore implementation of the IVoteRepository interface.
 * Uses existing utility functions for document references and error handling.
 */

import { getDoc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { Vote, Collections, getVoteId } from '@freedi/shared-types';
import { createDocRef, createCollectionRef } from '@/utils/firebaseUtils';
import { logError, DatabaseError } from '@/utils/errorHandling';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
import type { IVoteRepository } from '../interfaces/IVoteRepository';

export class FirebaseVoteRepository implements IVoteRepository {
	async save(vote: Vote): Promise<void> {
		try {
			if (!vote.voteId) {
				throw new DatabaseError('Vote must have a voteId', {
					operation: 'FirebaseVoteRepository.save',
				});
			}

			const docRef = createDocRef(Collections.votes, vote.voteId);
			await setDoc(docRef, vote);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseVoteRepository.save',
				metadata: { voteId: vote.voteId },
			});
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Vote ID is required for deletion', {
					operation: 'FirebaseVoteRepository.delete',
				});
			}

			const docRef = createDocRef(Collections.votes, id);
			await deleteDoc(docRef);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseVoteRepository.delete',
				metadata: { voteId: id },
			});
			throw error;
		}
	}

	async getByStatement(statementId: string): Promise<Vote[]> {
		try {
			if (!statementId) {
				throw new DatabaseError('Statement ID is required', {
					operation: 'FirebaseVoteRepository.getByStatement',
				});
			}

			const collectionRef = createCollectionRef(Collections.votes);
			const q = query(collectionRef, where('parentId', '==', statementId));
			const querySnap = await getDocs(q);

			return querySnap.docs.map((doc) => convertTimestampsToMillis(doc.data()) as Vote);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseVoteRepository.getByStatement',
				statementId,
			});

			return [];
		}
	}

	async getByUser(userId: string, parentId: string): Promise<Vote | undefined> {
		try {
			if (!userId || !parentId) {
				throw new DatabaseError('User ID and Parent ID are required', {
					operation: 'FirebaseVoteRepository.getByUser',
				});
			}

			const voteId = getVoteId(userId, parentId);
			const docRef = createDocRef(Collections.votes, voteId);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return undefined;
			}

			return convertTimestampsToMillis(docSnap.data()) as Vote;
		} catch (error) {
			logError(error, {
				operation: 'FirebaseVoteRepository.getByUser',
				userId,
				metadata: { parentId },
			});

			return undefined;
		}
	}
}
