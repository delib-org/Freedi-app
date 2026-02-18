import { Unsubscribe } from 'firebase/auth';
import { and, collection, doc, limit, or, orderBy, query, where } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { normalizeStatementData } from '@/helpers/timestampHelpers';

// Redux Store
import { FireStore } from '../config';
import {
	deleteStatement,
	removeMembership,
	setMembership,
	setStatement,
	setStatementSubscription,
	setStatements,
} from '@/redux/statements/statementsSlice';
import { AppDispatch, store } from '@/redux/store';
import {
	StatementSubscription,
	Role,
	Collections,
	StatementType,
	Statement,
	StatementSchema,
	Creator,
} from '@freedi/shared-types';

import { parse, safeParse, flatten } from 'valibot';
import React from 'react';
import {
	createManagedDocumentListener,
	createManagedCollectionListener,
	generateListenerKey,
} from '@/controllers/utils/firestoreListenerHelpers';

// Helpers
export const listenToStatementSubscription = (
	statementId: string,
	creator: Creator,
	setHasSubscription?: React.Dispatch<React.SetStateAction<boolean>>,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		const docId = `${creator.uid}--${statementId}`;
		const statementsSubscribeRef = doc(FireStore, Collections.statementsSubscribe, docId);

		const listenerKey = generateListenerKey('statement-subscription', 'subscription', docId);

		// Track if we've already handled the error to prevent infinite loops
		let errorHandled = false;
		// Initialize to noop to avoid null window between listener creation and assignment
		let unsubscribeFn: Unsubscribe = () => {};

		const listener = createManagedDocumentListener(
			statementsSubscribeRef,
			listenerKey,
			(statementSubscriptionDB) => {
				try {
					if (!statementSubscriptionDB.exists()) {
						// No subscription found

						if (setHasSubscription) setHasSubscription(false);

						return;
					}
					const statementSubscription = statementSubscriptionDB.data() as StatementSubscription;

					const { role } = statementSubscription;

					//@ts-ignore
					if (role === 'statement-creator') {
						statementSubscription.role = Role.admin;
					} else if (role === undefined) {
						statementSubscription.role = Role.unsubscribed;
						console.info('Role is undefined. Setting role to unsubscribed');
					}

					dispatch(setStatementSubscription(statementSubscription));
				} catch (error) {
					console.error(error);
				}
			},
			(error) => {
				// Prevent infinite loops by only handling the error once
				if (errorHandled) return;
				errorHandled = true;

				// Handle permission errors more gracefully
				const err = error as { code?: string };
				if (err?.code === 'permission-denied') {
					// Permission denied is expected for some users, handle silently
					if (setHasSubscription) setHasSubscription(false);
					// Unsubscribe immediately to prevent repeated error callbacks
					unsubscribeFn();
				} else {
					console.error('Error in statement subscription listener:', error);
				}
			},
		);

		// Store the actual unsubscribe function (closure captures the variable binding,
		// so the error handler above will always call the current value)
		unsubscribeFn = listener;

		return listener;
	} catch (error) {
		console.error(error);

		return () => {};
	}
};

export const listenToStatement = (
	statementId: string | undefined,
	setIsStatementNotFound?: React.Dispatch<React.SetStateAction<boolean>>,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		const statementRef = doc(FireStore, Collections.statements, statementId);

		const listenerKey = generateListenerKey('statement', 'statement', statementId);

		return createManagedDocumentListener(
			statementRef,
			listenerKey,
			(statementDB) => {
				try {
					if (!statementDB.exists()) {
						if (setIsStatementNotFound) setIsStatementNotFound(true);
						throw new Error('Statement does not exist');
					}
					// Normalize data to remove non-serializable values (like VectorValue embeddings)
					const statement = normalizeStatementData(statementDB.data()) as Statement;

					dispatch(setStatement(statement));
				} catch (error) {
					console.error(error);
					if (setIsStatementNotFound) setIsStatementNotFound(true);
				}
			},
			(error) => {
				console.error('Error in statement listener:', error);
				if (setIsStatementNotFound) setIsStatementNotFound(true);
			},
		);
	} catch (error) {
		console.error(error);
		if (setIsStatementNotFound) setIsStatementNotFound(true);

		return () => {};
	}
};

export const listenToSubStatements = (
	statementId: string | undefined,
	topBottom?: 'top' | 'bottom',
	numberOfOptions?: number,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		const statementsRef = collection(FireStore, Collections.statements);

		// Reduce the initial load to 25 items for faster initial loading
		// This should be enough for most use cases while dramatically improving load time
		const descAsc = topBottom === 'top' ? 'desc' : 'asc';

		// Build the base query
		let q = query(
			statementsRef,
			where('parentId', '==', statementId),
			where('statementType', '!=', StatementType.document),
			orderBy('createdAt', descAsc),
		);

		// Only add limit if numberOfOptions is provided
		if (numberOfOptions) {
			q = query(q, limit(numberOfOptions));
		}

		const listenerKey = generateListenerKey(
			'sub-statements',
			'statement',
			`${statementId}-${topBottom || 'all'}-${numberOfOptions || 'all'}`,
		);

		let isFirstCall = true;

		return createManagedCollectionListener(
			q,
			listenerKey,
			(statementsDB) => {
				// For the first call, batch process all statements at once
				if (isFirstCall) {
					const startStatements: Statement[] = [];

					statementsDB.forEach((doc) => {
						// Normalize data to remove non-serializable values (like VectorValue embeddings)
						const statement = normalizeStatementData(doc.data()) as Statement;
						startStatements.push(statement);
					});

					// Dispatch all statements at once instead of individually
					if (startStatements.length > 0) {
						dispatch(setStatements(startStatements));
					}

					isFirstCall = false;
				} else {
					// After initial load, handle individual changes
					const changes = statementsDB.docChanges();

					changes.forEach((change) => {
						// Normalize data to remove non-serializable values (like VectorValue embeddings)
						const statement = normalizeStatementData(change.doc.data()) as Statement;

						if (change.type === 'added') {
							dispatch(setStatement(statement));
						} else if (change.type === 'modified') {
							dispatch(setStatement(statement));
						} else if (change.type === 'removed') {
							dispatch(deleteStatement(statement.statementId));
						}
					});
				}
			},
			(error) => console.error('Error in sub-statements listener:', error),
			'query',
		);
	} catch (error) {
		console.error(error);

		return () => {};
	}
};

export const listenToMembers = (dispatch: AppDispatch) => (statementId: string) => {
	try {
		const membersRef = collection(FireStore, Collections.statementsSubscribe);
		const q = query(
			membersRef,
			where('statementId', '==', statementId),
			where('statement.statementType', '!=', StatementType.document),
			orderBy('createdAt', 'desc'),
			limit(10), // Load only last 10 members initially, more can be loaded on demand
		);

		const listenerKey = generateListenerKey('members', 'statement', statementId);

		return createManagedCollectionListener(
			q,
			listenerKey,
			(subsDB) => {
				subsDB.docChanges().forEach((change) => {
					const member = change.doc.data() as StatementSubscription;
					if (change.type === 'added') {
						dispatch(setMembership(member));
					}

					if (change.type === 'modified') {
						dispatch(setMembership(member));
					}

					if (change.type === 'removed') {
						dispatch(removeMembership(member.statementsSubscribeId));
					}
				});
			},
			(error) => console.error('Error in members listener:', error),
			'query',
		);
	} catch (error) {
		console.error(error);

		return () => {};
	}
};

export function listenToAllSubStatements(statementId: string, numberOfLastMessages = 7) {
	try {
		if (numberOfLastMessages > 25) numberOfLastMessages = 25;
		if (!statementId) throw new Error('Statement id is undefined');

		const statementsRef = collection(FireStore, Collections.statements);
		const q = query(
			statementsRef,
			where('topParentId', '==', statementId),
			where('statementId', '!=', statementId),
			orderBy('createdAt', 'desc'),
			limit(numberOfLastMessages),
		);

		const listenerKey = generateListenerKey(
			'all-sub-statements',
			'statement',
			`${statementId}-${numberOfLastMessages}`,
		);

		return createManagedCollectionListener(
			q,
			listenerKey,
			(statementsDB) => {
				statementsDB.docChanges().forEach((change) => {
					const data = change.doc.data();
					const docId = change.doc.id;

					// Use safeParse to get detailed validation information
					const result = safeParse(StatementSchema, data);

					if (!result.success) {
						// Get flattened error messages for easier reading
						const flatErrors = flatten(result.issues);

						console.error('=== STATEMENT VALIDATION ERROR ===');
						console.error('Document ID:', docId);
						console.error('Full data received:', JSON.stringify(data, null, 2));
						console.error('Data type:', typeof data);

						// Log detailed validation issues
						console.error('Validation Issues:');
						result.issues.forEach((issue, index) => {
							console.error(`Issue ${index + 1}:`, {
								kind: issue.kind,
								type: issue.type,
								input: issue.input,
								expected: issue.expected,
								received: issue.received,
								message: issue.message,
								path: issue.path?.map((p) => p.key).join('.'),
								requirement: issue.requirement,
							});
						});

						// Log flattened errors
						console.error('Flattened errors:', flatErrors);

						// Log specific field analysis
						if (data && typeof data === 'object') {
							console.error('Field analysis:', {
								hasRequiredFields: {
									statement: 'statement' in data,
									statementId: 'statementId' in data,
									creatorId: 'creatorId' in data,
									creator: 'creator' in data,
									statementType: 'statementType' in data,
									parentId: 'parentId' in data,
									topParentId: 'topParentId' in data,
									lastUpdate: 'lastUpdate' in data,
									createdAt: 'createdAt' in data,
									consensus: 'consensus' in data,
								},
								fieldTypes: {
									statement: typeof data.statement,
									statementId: typeof data.statementId,
									creatorId: typeof data.creatorId,
									creator: typeof data.creator,
									statementType: typeof data.statementType,
									parentId: typeof data.parentId,
									topParentId: typeof data.topParentId,
									lastUpdate: typeof data.lastUpdate,
									createdAt: typeof data.createdAt,
									consensus: typeof data.consensus,
								},
								problematicFields: {
									resultsSettings: data.resultsSettings,
									resultsSettingsType: typeof data.resultsSettings,
									cutoffBy: data.resultsSettings?.cutoffBy,
								},
							});
						}
						console.error('=== END VALIDATION ERROR ===\n');

						return;
					}

					// Successfully parsed
					const statement = result.output;

					if (statement.statementId === statementId) return;

					switch (change.type) {
						case 'added':
						case 'modified':
							store.dispatch(setStatement(statement));
							break;
						case 'removed':
							store.dispatch(deleteStatement(statement.statementId));
							break;
					}
				});
			},
			(error) => console.error('Error in all sub-statements listener:', error),
			'query',
		);
	} catch (error) {
		console.error(error);

		return (): void => {
			return;
		};
	}
}
export const listenToUserSuggestions = (
	statementId: string | undefined,
	userId: string | undefined,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		if (!userId) throw new Error('User id is undefined');

		const statementsRef = collection(FireStore, Collections.statements);

		// Query for options created by the user under this statement
		const q = query(
			statementsRef,
			where('parentId', '==', statementId),
			where('creatorId', '==', userId),
			where('statementType', '==', StatementType.option),
			orderBy('createdAt', 'desc'),
		);

		const listenerKey = generateListenerKey(
			'user-suggestions',
			'statement',
			`${statementId}-${userId}`,
		);

		let isFirstCall = true;

		return createManagedCollectionListener(
			q,
			listenerKey,
			(statementsDB) => {
				if (isFirstCall) {
					const userOptions: Statement[] = [];

					statementsDB.forEach((doc) => {
						// Normalize data to remove non-serializable values (like VectorValue embeddings)
						const statement = normalizeStatementData(doc.data()) as Statement;
						userOptions.push(statement);
					});

					// Dispatch all user options at once
					if (userOptions.length > 0) {
						dispatch(setStatements(userOptions));
					}

					isFirstCall = false;
				} else {
					// Handle individual changes after initial load
					statementsDB.docChanges().forEach((change) => {
						// Normalize data to remove non-serializable values (like VectorValue embeddings)
						const statement = normalizeStatementData(change.doc.data()) as Statement;

						if (change.type === 'added' || change.type === 'modified') {
							dispatch(setStatement(statement));
						} else if (change.type === 'removed') {
							dispatch(deleteStatement(statement.statementId));
						}
					});
				}
			},
			(error) => console.error('Error listening to user suggestions:', error),
			'query',
		);
	} catch (error) {
		console.error('Error setting up user suggestions listener:', error);

		return () => {};
	}
};

// Maximum number of descendants to load at once for performance
const MAX_DESCENDANTS_LIMIT = 200;

export function listenToAllDescendants(statementId: string): Unsubscribe {
	try {
		const statementsRef = collection(FireStore, Collections.statements);
		// Query ONLY for questions, groups, and options (not any other types)
		// Wrap in and() as required by Firestore for composite filters
		// Added limit to prevent loading too many documents at once
		const q = query(
			statementsRef,
			and(
				where('parents', 'array-contains', statementId),
				or(
					where('statementType', '==', StatementType.question),
					where('statementType', '==', StatementType.group),
					where('statementType', '==', StatementType.option),
				),
			),
			orderBy('createdAt', 'desc'),
			limit(MAX_DESCENDANTS_LIMIT),
		);

		const listenerKey = generateListenerKey('all-descendants', 'statement', statementId);

		// Use batched updates for better performance
		let isFirstBatch = true;
		const statements: Statement[] = [];
		let loadedCount = 0;

		return createManagedCollectionListener(
			q,
			listenerKey,
			(statementsDB) => {
				if (isFirstBatch) {
					// Process the initial batch of statements all at once
					statementsDB.forEach((doc) => {
						try {
							const statement = parse(StatementSchema, normalizeStatementData(doc.data()));
							statements.push(statement);
							loadedCount++;
						} catch (error) {
							logError(error, {
								operation: 'listenToAllDescendants.parseInitial',
								statementId: doc.id,
								metadata: {
									parentStatementId: statementId,
									loadedCount,
								},
							});
						}
					});

					// Dispatch all statements at once instead of one by one
					if (statements.length > 0) {
						store.dispatch(setStatements(statements));
						console.info(
							`[listenToAllDescendants] Loaded ${statements.length} descendants for statement ${statementId}`,
						);
					}

					isFirstBatch = false;
				} else {
					// After initial load, process changes individually
					const changes = statementsDB.docChanges();

					changes.forEach((change) => {
						try {
							const statement = parse(StatementSchema, normalizeStatementData(change.doc.data()));

							if (change.type === 'added' || change.type === 'modified') {
								store.dispatch(setStatement(statement));
							} else if (change.type === 'removed') {
								store.dispatch(deleteStatement(statement.statementId));
							}
						} catch (error) {
							logError(error, {
								operation: 'listenToAllDescendants.processChange',
								statementId: change.doc.id,
								metadata: {
									parentStatementId: statementId,
									changeType: change.type,
									loadedCount,
								},
							});
						}
					});
				}
			},
			(error) => {
				logError(error, {
					operation: 'listenToAllDescendants.listener',
					metadata: {
						parentStatementId: statementId,
						loadedCount,
					},
				});
			},
			'query',
		);
	} catch (error) {
		logError(error, {
			operation: 'listenToAllDescendants.setup',
			metadata: { parentStatementId: statementId },
		});

		return (): void => {
			return;
		};
	}
}
