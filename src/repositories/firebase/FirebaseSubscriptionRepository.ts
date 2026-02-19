/**
 * Firebase Subscription Repository
 *
 * Firestore implementation of the ISubscriptionRepository interface.
 * Uses existing utility functions for document references, error handling,
 * and listener management.
 */

import {
	getDoc,
	setDoc,
	updateDoc,
	deleteDoc,
	getDocs,
	query,
	where,
	orderBy,
	DocumentSnapshot,
} from 'firebase/firestore';
import { Unsubscribe } from 'firebase/auth';
import { StatementSubscription, Collections } from '@freedi/shared-types';
import { createSubscriptionRef, createCollectionRef } from '@/utils/firebaseUtils';
import { logError, DatabaseError } from '@/utils/errorHandling';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';
import {
	createManagedDocumentListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';
import type { ISubscriptionRepository } from '../interfaces/ISubscriptionRepository';

export class FirebaseSubscriptionRepository implements ISubscriptionRepository {
	async getById(id: string): Promise<StatementSubscription | undefined> {
		try {
			if (!id) {
				throw new DatabaseError('Subscription ID is required', {
					operation: 'FirebaseSubscriptionRepository.getById',
				});
			}

			const docRef = createSubscriptionRef(id);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return undefined;
			}

			return convertTimestampsToMillis(docSnap.data()) as StatementSubscription;
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.getById',
				metadata: { subscriptionId: id },
			});

			return undefined;
		}
	}

	async save(subscription: StatementSubscription): Promise<void> {
		try {
			if (!subscription.statementsSubscribeId) {
				throw new DatabaseError('Subscription must have a statementsSubscribeId', {
					operation: 'FirebaseSubscriptionRepository.save',
				});
			}

			const docRef = createSubscriptionRef(subscription.statementsSubscribeId);
			await setDoc(docRef, subscription);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.save',
				metadata: { subscriptionId: subscription.statementsSubscribeId },
			});
			throw error;
		}
	}

	async update(id: string, fields: Partial<StatementSubscription>): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Subscription ID is required for update', {
					operation: 'FirebaseSubscriptionRepository.update',
				});
			}

			const docRef = createSubscriptionRef(id);
			await updateDoc(docRef, fields);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.update',
				metadata: { subscriptionId: id },
			});
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Subscription ID is required for deletion', {
					operation: 'FirebaseSubscriptionRepository.delete',
				});
			}

			const docRef = createSubscriptionRef(id);
			await deleteDoc(docRef);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.delete',
				metadata: { subscriptionId: id },
			});
			throw error;
		}
	}

	async getByStatement(statementId: string): Promise<StatementSubscription[]> {
		try {
			if (!statementId) {
				throw new DatabaseError('Statement ID is required', {
					operation: 'FirebaseSubscriptionRepository.getByStatement',
				});
			}

			const collectionRef = createCollectionRef(Collections.statementsSubscribe);
			const q = query(
				collectionRef,
				where('statementId', '==', statementId),
				orderBy('createdAt', 'desc'),
			);
			const querySnap = await getDocs(q);

			return querySnap.docs.map(
				(doc) => convertTimestampsToMillis(doc.data()) as StatementSubscription,
			);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.getByStatement',
				statementId,
			});

			return [];
		}
	}

	async getByUser(userId: string): Promise<StatementSubscription[]> {
		try {
			if (!userId) {
				throw new DatabaseError('User ID is required', {
					operation: 'FirebaseSubscriptionRepository.getByUser',
				});
			}

			const collectionRef = createCollectionRef(Collections.statementsSubscribe);
			const q = query(collectionRef, where('userId', '==', userId), orderBy('lastUpdate', 'desc'));
			const querySnap = await getDocs(q);

			return querySnap.docs.map(
				(doc) => convertTimestampsToMillis(doc.data()) as StatementSubscription,
			);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.getByUser',
				userId,
			});

			return [];
		}
	}

	listenToSubscription(
		id: string,
		callback: (subscription: StatementSubscription | undefined) => void,
	): Unsubscribe {
		try {
			if (!id) {
				throw new DatabaseError('Subscription ID is required for listener', {
					operation: 'FirebaseSubscriptionRepository.listenToSubscription',
				});
			}

			const docRef = createSubscriptionRef(id);
			const listenerKey = generateListenerKey('repo-subscription', 'document', id);

			return createManagedDocumentListener(
				docRef,
				listenerKey,
				(snapshot: DocumentSnapshot) => {
					try {
						if (!snapshot.exists()) {
							callback(undefined);

							return;
						}

						const subscription = convertTimestampsToMillis(
							snapshot.data(),
						) as StatementSubscription;
						callback(subscription);
					} catch (error) {
						logError(error, {
							operation: 'FirebaseSubscriptionRepository.listenToSubscription.onSnapshot',
							metadata: { subscriptionId: id },
						});
						callback(undefined);
					}
				},
				(error) => {
					logError(error, {
						operation: 'FirebaseSubscriptionRepository.listenToSubscription.onError',
						metadata: { subscriptionId: id },
					});
				},
			);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseSubscriptionRepository.listenToSubscription',
				metadata: { subscriptionId: id },
			});

			return () => {};
		}
	}
}
