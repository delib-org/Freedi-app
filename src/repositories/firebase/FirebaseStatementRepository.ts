/**
 * Firebase Statement Repository
 *
 * Firestore implementation of the IStatementRepository interface.
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
	QuerySnapshot,
} from 'firebase/firestore';
import { Unsubscribe } from 'firebase/auth';
import { Statement, Collections } from '@freedi/shared-types';
import { createStatementRef, createCollectionRef } from '@/utils/firebaseUtils';
import { logError, DatabaseError } from '@/utils/errorHandling';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import {
	createManagedDocumentListener,
	createManagedCollectionListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';
import type { IStatementRepository } from '../interfaces/IStatementRepository';

export class FirebaseStatementRepository implements IStatementRepository {
	async getById(id: string): Promise<Statement | undefined> {
		try {
			if (!id) {
				throw new DatabaseError('Statement ID is required', {
					operation: 'FirebaseStatementRepository.getById',
				});
			}

			const docRef = createStatementRef(id);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return undefined;
			}

			return normalizeStatementData(docSnap.data()) as Statement;
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.getById',
				statementId: id,
			});

			return undefined;
		}
	}

	async save(statement: Statement): Promise<void> {
		try {
			if (!statement.statementId) {
				throw new DatabaseError('Statement must have a statementId', {
					operation: 'FirebaseStatementRepository.save',
				});
			}

			const docRef = createStatementRef(statement.statementId);
			await setDoc(docRef, statement);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.save',
				statementId: statement.statementId,
			});
			throw error;
		}
	}

	async update(id: string, fields: Partial<Statement>): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Statement ID is required for update', {
					operation: 'FirebaseStatementRepository.update',
				});
			}

			const docRef = createStatementRef(id);
			await updateDoc(docRef, fields);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.update',
				statementId: id,
			});
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		try {
			if (!id) {
				throw new DatabaseError('Statement ID is required for deletion', {
					operation: 'FirebaseStatementRepository.delete',
				});
			}

			const docRef = createStatementRef(id);
			await deleteDoc(docRef);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.delete',
				statementId: id,
			});
			throw error;
		}
	}

	async getChildrenByParent(parentId: string): Promise<Statement[]> {
		try {
			if (!parentId) {
				throw new DatabaseError('Parent ID is required', {
					operation: 'FirebaseStatementRepository.getChildrenByParent',
				});
			}

			const collectionRef = createCollectionRef(Collections.statements);
			const q = query(
				collectionRef,
				where('parentId', '==', parentId),
				orderBy('createdAt', 'desc'),
			);
			const querySnap = await getDocs(q);

			return querySnap.docs.map((doc) => normalizeStatementData(doc.data()) as Statement);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.getChildrenByParent',
				metadata: { parentId },
			});

			return [];
		}
	}

	listenToDocument(id: string, callback: (statement: Statement | undefined) => void): Unsubscribe {
		try {
			if (!id) {
				throw new DatabaseError('Statement ID is required for listener', {
					operation: 'FirebaseStatementRepository.listenToDocument',
				});
			}

			const docRef = createStatementRef(id);
			const listenerKey = generateListenerKey('repo-statement', 'document', id);

			return createManagedDocumentListener(
				docRef,
				listenerKey,
				(snapshot: DocumentSnapshot) => {
					try {
						if (!snapshot.exists()) {
							callback(undefined);

							return;
						}

						const statement = normalizeStatementData(snapshot.data()) as Statement;
						callback(statement);
					} catch (error) {
						logError(error, {
							operation: 'FirebaseStatementRepository.listenToDocument.onSnapshot',
							statementId: id,
						});
						callback(undefined);
					}
				},
				(error) => {
					logError(error, {
						operation: 'FirebaseStatementRepository.listenToDocument.onError',
						statementId: id,
					});
				},
			);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.listenToDocument',
				statementId: id,
			});

			return () => {};
		}
	}

	listenToChildren(parentId: string, callback: (statements: Statement[]) => void): Unsubscribe {
		try {
			if (!parentId) {
				throw new DatabaseError('Parent ID is required for listener', {
					operation: 'FirebaseStatementRepository.listenToChildren',
				});
			}

			const collectionRef = createCollectionRef(Collections.statements);
			const q = query(
				collectionRef,
				where('parentId', '==', parentId),
				orderBy('createdAt', 'desc'),
			);
			const listenerKey = generateListenerKey('repo-statement', 'children', parentId);

			return createManagedCollectionListener(
				q,
				listenerKey,
				(snapshot: QuerySnapshot) => {
					try {
						const statements: Statement[] = snapshot.docs.map(
							(doc) => normalizeStatementData(doc.data()) as Statement,
						);
						callback(statements);
					} catch (error) {
						logError(error, {
							operation: 'FirebaseStatementRepository.listenToChildren.onSnapshot',
							metadata: { parentId },
						});
						callback([]);
					}
				},
				(error) => {
					logError(error, {
						operation: 'FirebaseStatementRepository.listenToChildren.onError',
						metadata: { parentId },
					});
				},
				'query',
			);
		} catch (error) {
			logError(error, {
				operation: 'FirebaseStatementRepository.listenToChildren',
				metadata: { parentId },
			});

			return () => {};
		}
	}
}
