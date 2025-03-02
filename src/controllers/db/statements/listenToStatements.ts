import { Unsubscribe } from 'firebase/auth';
import {
	and,
	collection,
	doc,
	limit,
	onSnapshot,
	or,
	orderBy,
	query,
	where,
} from 'firebase/firestore';

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
	Collections,
	StatementType,
	DeliberativeElement,
} from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/StatementTypes';
import { StatementSubscription } from '@/types/statement/StatementSubscription';
import { User } from '@/types/user/User';
import { parse } from 'valibot';
import React from 'react';
import { Role } from '@/types/user/UserSettings';

// Helpers

export const listenToStatementSubscription = (
	statementId: string,
	user: User,
	dispatch: AppDispatch
): Unsubscribe => {
	try {
		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			`${user.uid}--${statementId}`
		);

		return onSnapshot(statementsSubscribeRef, (statementSubscriptionDB) => {
			try {
				if (!statementSubscriptionDB.exists()) {
					console.info('No subscription found');

					return;
				}
				const statementSubscription =
					statementSubscriptionDB.data() as StatementSubscription;

				const { role } = statementSubscription;

				//@ts-ignore
				if (role === 'statement-creator') {
					statementSubscription.role = Role.admin;
				} else if (role === undefined) {
					statementSubscription.role = Role.unsubscribed;
					console.info(
						'Role is undefined. Setting role to unsubscribed'
					);
				}

				dispatch(setStatementSubscription(statementSubscription));
			} catch (error) {
				console.error(error);
			}
		});
	} catch (error) {
		console.error(error);

		return () => { };
	}
};

export const listenToStatement = (
	statementId: string | undefined,
	setIsStatementNotFound?: React.Dispatch<React.SetStateAction<boolean>>
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statementId
		);

		return onSnapshot(
			statementRef,
			(statementDB) => {
				try {
					if (!statementDB.exists()) {
						if (setIsStatementNotFound)
							setIsStatementNotFound(true);
						throw new Error('Statement does not exist');
					}
					const statement = statementDB.data() as Statement;

					dispatch(setStatement(statement));
				} catch (error) {
					console.error(error);
					if (setIsStatementNotFound) setIsStatementNotFound(true);
				}
			},
			(error) => console.error(error)
		);
	} catch (error) {
		console.error(error);
		if (setIsStatementNotFound) setIsStatementNotFound(true);

		return () => { };
	}
};

export const listenToSubStatements = (
	statementId: string | undefined
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		const statementsRef = collection(FireStore, Collections.statements);
		
		// FIXED: Remove the inequality filter that was causing the error
		// Firebase requires the first orderBy to match any field with inequality filters
		const q = query(
			statementsRef,
			where('parentId', '==', statementId),
			// Remove inequality filter and handle filtering in the client side
			orderBy('createdAt', 'desc'),
			limit(50) // Reduced from 100 to improve initial load time
		);
		
		let isFirstCall = true;
		let pendingUpdates: Statement[] = [];
		let updateTimeout: NodeJS.Timeout | null = null;

		// Batch updates for better performance
		const processBatchUpdates = () => {
			if (pendingUpdates.length === 0) return;
			
			// Process all updates at once
			dispatch(setStatements(pendingUpdates));
			pendingUpdates = [];
			updateTimeout = null;
		};

		return onSnapshot(q, (statementsDB) => {
			// Use startStatements only for first call to reduce Redux updates
			if (isFirstCall) {
				const startStatements: Statement[] = [];
				statementsDB.forEach((doc) => {
					const data = doc.data() as Statement;
					// Apply the filter that was removed from query on the client side
					if (data.statementType !== StatementType.document) {
						startStatements.push(data);
					}
				});
				isFirstCall = false;
				
				// Dispatch once with all initial statements
				if (startStatements.length > 0) {
					dispatch(setStatements(startStatements));
				}
				return;
			}
			
			// For subsequent calls, batch updates
			statementsDB.docChanges().forEach((change) => {
				const statement = change.doc.data() as Statement;
				
				// Apply filter on client side
				if (statement.statementType === StatementType.document) {
					return; // Skip documents we don't want
				}

				if (change.type === 'added' || change.type === 'modified') {
					// Add to pending updates instead of immediate dispatch
					pendingUpdates.push(statement);
				}

				if (change.type === 'removed') {
					dispatch(deleteStatement(statement.statementId));
				}
			});
			
			// Debounce updates to reduce render cycles
			if (pendingUpdates.length > 0) {
				if (updateTimeout) {
					clearTimeout(updateTimeout);
				}
				updateTimeout = setTimeout(processBatchUpdates, 100);
			}
		});
	} catch (error) {
		console.error(error);
		return () => { };
	}
};

export const listenToMembers =
	(dispatch: AppDispatch) => (statementId: string) => {
		try {
			const membersRef = collection(
				FireStore,
				Collections.statementsSubscribe
			);
			
			// FIXED: Fix query to avoid Firebase error by ordering first by the field with inequality
			const q = query(
				membersRef,
				where('statementId', '==', statementId),
				// Remove the inequality filter and handle it in client-side code
				orderBy('createdAt', 'desc')
			);

			return onSnapshot(q, (subsDB) => {
				subsDB.docChanges().forEach((change) => {
					const member = change.doc.data() as StatementSubscription;
					
					// Filter out documents on client side
					if (member.statement?.statementType === StatementType.document) {
						return;
					}
					
					if (change.type === 'added') {
						dispatch(setMembership(member));
					}

					if (change.type === 'modified') {
						dispatch(setMembership(member));
					}

					if (change.type === 'removed') {
						dispatch(
							removeMembership(member.statementsSubscribeId)
						);
					}
				});
			});
		} catch (error) {
			console.error(error);
		}
	};

export async function listenToUserAnswer(
	questionId: string,
	cb: (statement: Statement) => void
) {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		const statementsRef = collection(FireStore, Collections.statements);
		
		// FIXED: Reorder where clauses to match orderBy requirements
		const q = query(
			statementsRef,
			where('parentId', '==', questionId),
			where('creatorId', '==', user.uid),
			where('statementType', '==', StatementType.option),
			orderBy('createdAt', 'desc'),
			limit(1)
		);

		return onSnapshot(q, (statementsDB) => {
			statementsDB.docChanges().forEach((change) => {
				const statement = parse(StatementSchema, change.doc.data());
				cb(statement);
			});
		});
	} catch (error) {
		console.error(error);
	}
}

export async function listenToChildStatements(
	dispatch: AppDispatch,
	statementId: string,
	callback: (childStatements: Statement[]) => void
): Promise<Unsubscribe | null> {
	try {
		const statementsRef = collection(FireStore, Collections.statements);
		
		// FIXED: Simplified query to avoid Firebase error
		const q = query(
			statementsRef,
			where('parents', 'array-contains', statementId)
		);

		const unsubscribe = onSnapshot(q, (statementsDB) => {
			const childStatements: Statement[] = [];

			statementsDB.forEach((doc) => {
				const childStatement = doc.data() as Statement;
				
				// Filter on client side instead of in the query
				const isOptionOrResearch = 
					childStatement.deliberativeElement === DeliberativeElement.option ||
					childStatement.deliberativeElement === DeliberativeElement.research;
					
				if (isOptionOrResearch) {
					childStatements.push(childStatement);
					dispatch(setStatement(childStatement));
				}
			});

			callback(childStatements);
		});

		return unsubscribe;
	} catch (error) {
		console.error(error);

		return null;
	}
}

export function listenToAllSubStatements(
	statementId: string,
	numberOfLastMessages = 7
) {
	try {
		if (numberOfLastMessages > 25) numberOfLastMessages = 25;
		if (!statementId) throw new Error('Statement id is undefined');

		const statementsRef = collection(FireStore, Collections.statements);
		
		// FIXED: Reorder where clauses to match orderBy requirements
		const q = query(
			statementsRef,
			where('topParentId', '==', statementId),
			// Handle statementId filtering on client side
			orderBy('createdAt', 'desc'),
			limit(numberOfLastMessages)
		);

		return onSnapshot(q, (statementsDB) => {
			statementsDB.docChanges().forEach((change) => {
				const statement = parse(StatementSchema, change.doc.data());

				// Handle filtering on client side
				if (statement.statementId === statementId) return;

				switch (change.type) {
					case 'added':
						store.dispatch(setStatement(statement));
						break;
					case 'removed':
						store.dispatch(deleteStatement(statement.statementId));
						break;
				}
			});
		});
	} catch (error) {
		console.error(error);

		return (): void => {
			return;
		};
	}
}

export function listenToAllDescendants(statementId: string): Unsubscribe {
	try {
		// If no statementId provided, return a no-op
		if (!statementId) {
			console.warn('No statementId provided to listenToAllDescendants');
			return () => {};
		}
		
		// Get a reference to Firestore collection
		const statementsRef = collection(FireStore, Collections.statements);
		
		// Create a very simple query with minimal constraints to avoid internal errors
		// We'll do more detailed filtering on the client side
		const q = query(
			statementsRef,
			where('parents', 'array-contains', statementId),
			limit(15) // Significantly reduced limit to avoid internal errors
		);

		// Variables for batching updates
		let pendingStatements: Record<string, Statement> = {};
		let batchTimeout: NodeJS.Timeout | null = null;
		const batchInterval = 300; // Increased to reduce update frequency
		
		// Function to dispatch batched updates
		const processBatch = () => {
			if (Object.keys(pendingStatements).length === 0) return;
			
			try {
				// Convert object to array for dispatch
				const statementsArray = Object.values(pendingStatements);
				if (statementsArray.length > 0) {
					// Dispatch all statements at once to reduce Redux updates
					store.dispatch(setStatements(statementsArray));
				}
				
				// Clear the batch after processing
				pendingStatements = {};
				batchTimeout = null;
			} catch (err) {
				console.error('Error dispatching batch update:', err);
				pendingStatements = {};
				batchTimeout = null;
			}
		};

		// Error handling wrapper for snapshot listener
		// This adds an extra layer of protection against Firebase internal errors
		const safeSnapshotListener = (
			snapshot: any, 
			onData: (snapshot: any) => void, 
			onError: (error: any) => void
		) => {
			try {
				onData(snapshot);
			} catch (err) {
				console.error('Error in snapshot listener:', err);
				onError(err);
			}
		};
		
		// Listen for changes
		return onSnapshot(
			q, 
			(snapshot) => safeSnapshotListener(snapshot, (statementsDB) => {
				let hasChanges = false;
				
				// Process each document change
				try {
					statementsDB.docChanges().forEach((change) => {
						try {
							// Get the raw data
							const data = change.doc.data();
							const docId = change.doc.id;
							
							// Handle document removal
							if (change.type === 'removed') {
								store.dispatch(deleteStatement(docId));
								if (pendingStatements[docId]) {
									delete pendingStatements[docId];
								}
								return;
							} 
							
							// For adds and modifications, parse the data
							try {
								const statement = parse(StatementSchema, data);
								
								// Client-side filtering for deliberativeElement
								if (
									statement.deliberativeElement === DeliberativeElement.option ||
									statement.deliberativeElement === DeliberativeElement.research
								) {
									pendingStatements[statement.statementId] = statement;
									hasChanges = true;
								}
							} catch (parseErr) {
								console.error('Error parsing statement:', parseErr);
							}
						} catch (docErr) {
							console.error('Error processing document change:', docErr);
						}
					});
					
					// Schedule a batch update if there are changes
					if (hasChanges) {
						if (batchTimeout) {
							clearTimeout(batchTimeout);
						}
						batchTimeout = setTimeout(processBatch, batchInterval);
					}
				} catch (changesErr) {
					console.error('Error processing document changes:', changesErr);
				}
			}, 
			(error) => {
				console.error('Listen error for descendant statements:', error);
			}),
			// Error handler for the onSnapshot function itself
			(error) => {
				console.error('Error in listenToAllDescendants snapshot:', error);
			}
		);
	} catch (error) {
		console.error('Error setting up listenToAllDescendants:', error);
		return () => {};
	}
}