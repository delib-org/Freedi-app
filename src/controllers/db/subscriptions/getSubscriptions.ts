import {
	collection,
	doc,
	or,
	and,
	getDoc,
	limit,
	onSnapshot,
	orderBy,
	query,
	where,
	Unsubscribe,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { getStatementFromDB } from '../statements/getStatement';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	deleteSubscribedStatement,
	setStatementSubscription,
	setStatementsSubscription,
} from '@/redux/statements/statementsSlice';
import { AppDispatch, store } from '@/redux/store';
import {
	Statement,
	StatementSchema,
	StatementSubscription,
	StatementSubscriptionSchema,
	Role,
	User,
	Collections,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';

// Helper to check if an error is IndexedDB-related
function isIndexedDBError(error: unknown): boolean {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorCode = (error as { code?: string })?.code;

	const indexedDBPatterns = [
		'IndexedDB',
		'IDBDatabase',
		'Connection to Indexed Database server lost',
	];

	const firestoreErrorCodes = ['failed-precondition', 'unavailable', 'aborted'];

	return (
		indexedDBPatterns.some((pattern) =>
			errorMessage.toLowerCase().includes(pattern.toLowerCase()),
		) ||
		(errorCode !== undefined && firestoreErrorCodes.includes(errorCode))
	);
}

export const listenToStatementSubSubscriptions = (
	statementId: string,
	user: User,
	dispatch: AppDispatch,
): Unsubscribe => {
	try {
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');
		const statementsSubscribeRef = collection(FireStore, Collections.statementsSubscribe);
		const q = query(
			statementsSubscribeRef,
			where('statement.parentId', '==', statementId),
			where('userId', '==', user.uid),
			limit(20),
		);

		return onSnapshot(
			q,
			(subscriptionsDB) => {
				let firstCall = true;
				const statementSubscriptions: StatementSubscription[] = [];
				subscriptionsDB.docChanges().forEach((change) => {
					const data = change.doc.data();
					const statementSubscription = parse(
						StatementSubscriptionSchema,

						{
							...data,
							lastUpdated: data.lastUpdated?.toDate?.() ?? null,
						},
					);
					if (change.type === 'added') {
						if (firstCall) {
							statementSubscriptions.push(statementSubscription);
						} else {
							dispatch(setStatementSubscription(statementSubscription));
						}
					}
					if (change.type === 'modified') {
						dispatch(setStatementSubscription(statementSubscription));
					}
					if (change.type === 'removed') {
						dispatch(deleteSubscribedStatement(statementSubscription.statementId));
					}
				});
				firstCall = false;
				dispatch(setStatementsSubscription(statementSubscriptions));
			},
			(error) => {
				// Handle IndexedDB errors with retry
				if (isIndexedDBError(error)) {
					logError(error, { operation: 'subscriptions.listenToStatementSubSubscriptions', metadata: { message: 'IndexedDB connection lost in subscription listener' } });
					// IndexedDB errors are handled globally by indexedDBErrorHandler

					return;
				}

				// Handle permission errors silently for subscriptions
				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, { operation: 'subscriptions.getSubscriptions.unknown', metadata: { message: 'Subscription listener error:' } });
				}
			},
		);
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.unknown' });

		return () => {};
	}
};
export function listenToStatementSubscriptions(
	userId: string,
	numberOfStatements = 30,
): () => void {
	try {
		const dispatch = store.dispatch;

		const statementsSubscribeRef = collection(FireStore, Collections.statementsSubscribe);
		const q = query(
			statementsSubscribeRef,
			where('userId', '==', userId),
			where('statement.parentId', '==', 'top'),
			orderBy('lastUpdate', 'desc'),
			limit(numberOfStatements),
		);

		return onSnapshot(
			q,
			(subscriptionsDB) => {
				subscriptionsDB.docChanges().forEach((change) => {
					try {
						const statementSubscription = change.doc.data() as StatementSubscription;

						if (change.type === 'added' || change.type === 'modified')
							dispatch(setStatementSubscription(statementSubscription));

						if (change.type === 'removed')
							dispatch(deleteSubscribedStatement(statementSubscription.statementId));
					} catch (error) {
						logError(error, { operation: 'subscriptions.getSubscriptions.listenToStatementSubscriptions', metadata: { message: 'Listen to statement subscriptions each error' } });
					}
				});
			},
			(error) => {
				// Handle IndexedDB errors
				if (isIndexedDBError(error)) {
					logError(error, { operation: 'subscriptions.listenToStatementSubscriptions', metadata: { message: 'IndexedDB connection lost in statement subscriptions listener' } });
					// IndexedDB errors are handled globally by indexedDBErrorHandler

					return;
				}

				// Handle permission errors silently for subscriptions
				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, { operation: 'subscriptions.getSubscriptions.unknown', metadata: { message: 'Statement subscriptions listener error:' } });
				}
			},
		);
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.unknown', metadata: { message: 'Listen to statement subscriptions error' } });

		return () => {};
	}
}

export async function getIsSubscribed(
	statementId: string | undefined,
	userId: string,
): Promise<boolean> {
	try {
		if (!statementId) throw new Error('Statement id is undefined');

		const subscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			`${userId}--${statementId}`,
		);
		const subscriptionDB = await getDoc(subscriptionRef);

		if (!subscriptionDB.exists()) return false;

		return true;
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.getIsSubscribed' });

		return false;
	}
}

export async function getStatementSubscriptionFromDB(
	statementSubscriptionId: string,
): Promise<StatementSubscription | undefined> {
	try {
		if (!statementSubscriptionId) throw new Error('Statement subscription id is undefined');

		const subscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId,
		);
		const subscriptionDB = await getDoc(subscriptionRef);

		if (!subscriptionDB.exists()) return;

		return parse(StatementSubscriptionSchema, subscriptionDB.data());
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.getStatementSubscriptionFromDB' });
	}
}

export async function getTopParentSubscriptionFromDByStatement(
	statement: Statement,
	userId: string,
): Promise<StatementSubscription | undefined> {
	try {
		const { topParentId, parentId } = statement;
		if (parentId === 'top') return undefined;

		if (!topParentId) throw new Error('Top parent id is undefined');

		const topParentSubscriptionId = getStatementSubscriptionId(topParentId, userId);
		if (!topParentSubscriptionId) throw new Error('Top parent subscription id is undefined');
		const subscription = await getStatementSubscriptionFromDB(topParentSubscriptionId);

		return subscription;
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.getTopParentSubscriptionFromDByStatement' });
	}
}

interface GetTopParentSubscriptionProps {
	topParentStatement: Statement | undefined;
	topParentSubscription: StatementSubscription | undefined;
	error?: boolean;
}

export async function getTopParentSubscription(
	statementId: string,
	userId: string,
): Promise<GetTopParentSubscriptionProps> {
	try {
		const statement: Statement | undefined = await getStatement();

		const topParentId = statement.topParentId;
		if (!topParentId) throw new Error('Top parent id is undefined');

		const topParentSubscriptionId = getStatementSubscriptionId(topParentId, userId);

		//get top subscription

		const topParentSubscription = await getParentSubscription(topParentSubscriptionId);

		if (topParentSubscription) {
			return {
				topParentSubscription,
				topParentStatement: topParentSubscription.statement,
				error: false,
			};
		}

		//get top statement

		const topParentStatement: Statement | undefined = await getTopParentStatement(topParentId);

		return { topParentStatement, topParentSubscription, error: false };
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.getTopParentSubscription' });

		return {
			topParentStatement: undefined,
			topParentSubscription: undefined,
			error: true,
		};
	}

	async function getTopParentStatement(topParentId: string): Promise<Statement | undefined> {
		try {
			const topParentStatement: Statement | undefined = store
				.getState()
				.statements.statements.find((st) => st.statementId === topParentId);
			if (topParentStatement) return topParentStatement;

			const topParentStatementFromDB = await getStatementFromDB(topParentId);

			if (!topParentStatementFromDB) throw new Error('Top parent statement not found');

			return topParentStatementFromDB;
		} catch (error) {
			logError(error, { operation: 'subscriptions.getSubscriptions.getTopParentStatement' });

			return undefined;
		}
	}

	async function getParentSubscription(topParentSubscriptionId: string | undefined) {
		let topParentSubscription: StatementSubscription | undefined = store
			.getState()
			.statements.statementSubscription.find(
				(sub: StatementSubscription) => sub.statementsSubscribeId === topParentSubscriptionId,
			);

		if (!topParentSubscription) {
			if (!topParentSubscriptionId) throw new Error('Top parent subscription id is undefined');
			topParentSubscription = await getStatementSubscriptionFromDB(topParentSubscriptionId);
		}
		if (!topParentSubscription) throw new Error('Top parent subscription not found');

		return parse(StatementSubscriptionSchema, topParentSubscription);
	}

	async function getStatement() {
		let statement: Statement | undefined = store
			.getState()
			.statements.statements.find((st: Statement) => st.statementId === statementId);

		if (!statement) {
			statement = await getStatementFromDB(statementId);
		}
		if (!statement) throw new Error('Statement not found');

		return parse(StatementSchema, statement);
	}
}

export function getNewStatementsFromSubscriptions(userId: string): Unsubscribe {
	try {
		const dispatch = store.dispatch;
		//get the latest created statements
		const subscriptionsRef = collection(FireStore, Collections.statementsSubscribe);
		const q = query(
			subscriptionsRef,
			and(
				where('userId', '==', userId),
				where('statement.statementType', '!=', 'document'),
				or(
					where('role', '==', Role.admin),
					where('role', '==', Role.creator),
					where('role', '==', Role.member),
				),
			),
			orderBy('lastUpdate', 'desc'),
			limit(40),
		);

		return onSnapshot(
			q,
			(subscriptionsDB) => {
				subscriptionsDB.docChanges().forEach((change) => {
					const data = change.doc.data();
					const statementSubscription = parse(StatementSubscriptionSchema, {
						...data,
						lastUpdated: data.lastUpdated?.toDate?.() ?? null,
					});

					if (change.type === 'added' || change.type === 'modified') {
						dispatch(setStatementSubscription(statementSubscription));
					}
					if (change.type === 'removed') {
						dispatch(deleteSubscribedStatement(statementSubscription.statementId));
					}
				});
			},
			(error) => {
				// Handle IndexedDB errors
				if (isIndexedDBError(error)) {
					logError(error, { operation: 'subscriptions.getNewStatementsFromSubscriptions', metadata: { message: 'IndexedDB connection lost in new statements listener' } });
					// IndexedDB errors are handled globally by indexedDBErrorHandler

					return;
				}

				// Handle permission errors silently
				const err = error as { code?: string };
				if (err?.code !== 'permission-denied') {
					logError(error, { operation: 'subscriptions.getSubscriptions.unknown', metadata: { message: 'New statements listener error:' } });
				}
			},
		);
	} catch (error) {
		logError(error, { operation: 'subscriptions.getSubscriptions.unknown' });

		return () => {};
	}
}
