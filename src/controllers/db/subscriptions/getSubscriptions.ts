import {
	collection,
	doc,
	or,
	and,
	getDoc,
	getDocs,
	limit,
	onSnapshot,
	orderBy,
	query,
	where,
	Unsubscribe,
	updateDoc,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { getStatementFromDB } from '../statements/getStatement';
import { listenToStatement } from '../statements/listenToStatements';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	deleteSubscribedStatement,
	setStatementSubscription,
	setStatementsSubscription,
} from '@/redux/statements/statementsSlice';
import { AppDispatch, store } from '@/redux/store';
import { listenedStatements } from '@/view/pages/home/Home';
import { Collections } from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/Statement';
import {
	StatementSubscription,
	StatementSubscriptionSchema,
} from '@/types/statement/StatementSubscription';
import { Role } from '@/types/user/UserSettings';
import { User } from 'firebase/auth';
import { parse } from 'valibot';

export const listenToStatementSubSubscriptions = (
	statementId: string,
	user: User,
	dispatch: AppDispatch
): Unsubscribe => {
	try {
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');

		const statementsSubscribeRef = collection(
			FireStore,
			Collections.statementsSubscribe
		);
		const q = query(
			statementsSubscribeRef,
			where('statement.parentId', '==', statementId),
			where('userId', '==', user.uid),
			limit(20)
		);

		return onSnapshot(q, (subscriptionsDB) => {
			let firstCall = true;
			const statementSubscriptions: StatementSubscription[] = [];

			subscriptionsDB.docChanges().forEach((change) => {
				const statementSubscription = parse(
					StatementSubscriptionSchema,
					change.doc.data()
				);

				if (change.type === 'added') {
					if (firstCall) {
						statementSubscriptions.push(statementSubscription);
					} else {
						dispatch(
							setStatementSubscription(statementSubscription)
						);
					}
				}

				if (change.type === 'modified') {
					dispatch(setStatementSubscription(statementSubscription));
				}
			});
			firstCall = false;
			dispatch(setStatementsSubscription(statementSubscriptions));
		});
	} catch (error) {
		console.error(error);

		return () => {};
	}
};

export function listenToStatementSubscriptions(
	numberOfStatements = 30
): () => void {
	try {
		const dispatch = store.dispatch;
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');

		const statementsSubscribeRef = collection(
			FireStore,
			Collections.statementsSubscribe
		);
		const q = query(
			statementsSubscribeRef,
			where('userId', '==', user.uid),
			where('statement.parentId', '==', 'top'),
			orderBy('lastUpdate', 'desc'),
			limit(numberOfStatements)
		);

		return onSnapshot(q, (subscriptionsDB) => {
			subscriptionsDB.docChanges().forEach((change) => {
				try {
					const statementSubscription =
						change.doc.data() as StatementSubscription;
					if (
						!Array.isArray(statementSubscription.statement.results)
					) {
						const subscriptionRef = doc(
							FireStore,
							Collections.statementsSubscribe,
							statementSubscription.statementsSubscribeId
						);
						updateDoc(subscriptionRef, { 'statement.results': [] });
						statementSubscription.statement.results = [];
					}

					parse(StatementSubscriptionSchema, statementSubscription);

					//prevent listening to a document statement
					if (
						statementSubscription.statement.statementType ===
						'document'
					)
						return;

					if (change.type === 'added') {
						const unsubFunction = listenToStatement(
							statementSubscription.statementId
						);

						const index = listenedStatements.findIndex(
							(ls) =>
								ls.statementId ===
								statementSubscription.statementId
						);
						if (index === -1) {
							listenedStatements.push({
								unsubFunction,
								statementId: statementSubscription.statementId,
							});
						}

						dispatch(
							setStatementSubscription(statementSubscription)
						);
					}

					if (change.type === 'modified') {
						dispatch(
							setStatementSubscription(statementSubscription)
						);
					}

					if (change.type === 'removed') {
						const index = listenedStatements.findIndex(
							(ls) =>
								ls.statementId ===
								statementSubscription.statementId
						);
						if (index !== -1) {
							listenedStatements[index].unsubFunction();
							listenedStatements.splice(index, 1);
						}

						dispatch(
							deleteSubscribedStatement(
								statementSubscription.statementId
							)
						);
					}
				} catch (error) {
					console.error(
						'Listen to statement subscriptions each error',
						error
					);
				}
			});
		});
	} catch (error) {
		console.error('Listen to statement subscriptions error', error);

		return () => {};
	}
}

export async function getStatmentsSubsciptions(): Promise<
	StatementSubscription[]
> {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');
		const statementsSubscribeRef = collection(
			FireStore,
			Collections.statementsSubscribe
		);
		const q = query(
			statementsSubscribeRef,
			where('userId', '==', user.uid),
			limit(40)
		);
		const querySnapshot = await getDocs(q);

		const statementsSubscriptions: StatementSubscription[] = [];

		querySnapshot.forEach((doc) => {
			const statementsSubscription = parse(
				StatementSubscriptionSchema,
				doc.data()
			);
			statementsSubscriptions.push(statementsSubscription);
		});

		return statementsSubscriptions;
	} catch (error) {
		console.error(error);

		return [];
	}
}

export async function getSubscriptions() {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');
		const statementsSubscribeRef = collection(
			FireStore,
			Collections.statementsSubscribe
		);
		const q = query(
			statementsSubscribeRef,
			where('userId', '==', user.uid),
			orderBy('lastUpdate', 'desc'),
			limit(20)
		);

		const subscriptionsDB = await getDocs(q);

		const subscriptions: StatementSubscription[] = [];
		subscriptionsDB.forEach((doc) => {
			const statementSubscription = parse(
				StatementSubscriptionSchema,
				doc.data()
			);

			subscriptions.push(statementSubscription);
		});

		return subscriptions;
	} catch (error) {
		console.error(error);
	}
}

export async function getIsSubscribed(
	statementId: string | undefined
): Promise<boolean> {
	try {
		if (!statementId) throw new Error('Statement id is undefined');
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');

		const subscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			`${user.uid}--${statementId}`
		);
		const subscriptionDB = await getDoc(subscriptionRef);

		if (!subscriptionDB.exists()) return false;

		return true;
	} catch (error) {
		console.error(error);

		return false;
	}
}

export async function getStatementSubscriptionFromDB(
	statementSubscriptionId: string
): Promise<StatementSubscription | undefined> {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');

		if (!statementSubscriptionId)
			throw new Error('Statement subscription id is undefined');

		const subscriptionRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			statementSubscriptionId
		);
		const subscriptionDB = await getDoc(subscriptionRef);

		if (!subscriptionDB.exists()) return;

		return parse(StatementSubscriptionSchema, subscriptionDB.data());
	} catch (error) {
		console.error(error);
	}
}

export async function getTopParentSubscriptionFromDByStatement(
	statement: Statement
): Promise<StatementSubscription | undefined> {
	try {
		const { topParentId, parentId } = statement;
		if (parentId === 'top') return undefined;

		if (!topParentId) throw new Error('Top parent id is undefined');
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		const topParentSubscriptionId = getStatementSubscriptionId(
			topParentId,
			user
		);
		if (!topParentSubscriptionId)
			throw new Error('Top parent subscription id is undefined');
		const subscription = await getStatementSubscriptionFromDB(
			topParentSubscriptionId
		);

		return subscription;
	} catch (error) {
		console.error(error);
	}
}

interface GetTopParentSubscriptionProps {
	topParentStatement: Statement | undefined;
	topParentSubscription: StatementSubscription | undefined;
	error?: boolean;
}

export async function getTopParentSubscription(
	statementId: string
): Promise<GetTopParentSubscriptionProps> {
	try {
		//try to get the user from the store
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');

		const statement: Statement | undefined = await getStatement();

		const topParentId = statement.topParentId;
		if (!topParentId) throw new Error('Top parent id is undefined');

		const topParentSubscriptionId = getStatementSubscriptionId(
			topParentId,
			user
		);

		//get top subscription

		const topParentSubscription = await getParentSubscription(
			topParentSubscriptionId
		);

		if (topParentSubscription) {
			return {
				topParentSubscription,
				topParentStatement: topParentSubscription.statement,
				error: false,
			};
		}

		//get top statement

		const topParentStatement: Statement | undefined =
			await getTopParentStatement(topParentId);

		return { topParentStatement, topParentSubscription, error: false };
	} catch (error) {
		console.error(error);

		return {
			topParentStatement: undefined,
			topParentSubscription: undefined,
			error: true,
		};
	}

	async function getTopParentStatement(topParentId: string) {
		let topParentStatement: Statement | undefined = store
			.getState()
			.statements.statements.find((st) => st.statementId === topParentId);
		if (!topParentStatement) {
			topParentStatement = await getStatementFromDB(topParentId);
		}
		if (!topParentStatement)
			throw new Error('Top parent statement not found');

		return topParentStatement;
	}

	async function getParentSubscription(
		topParentSubscriptionId: string | undefined
	) {
		let topParentSubscription: StatementSubscription | undefined = store
			.getState()
			.statements.statementSubscription.find(
				(sub: StatementSubscription) =>
					sub.statementsSubscribeId === topParentSubscriptionId
			);

		if (!topParentSubscription) {
			if (!topParentSubscriptionId)
				throw new Error('Top parent subscription id is undefined');
			topParentSubscription = await getStatementSubscriptionFromDB(
				topParentSubscriptionId
			);
		}
		if (!topParentSubscription)
			throw new Error('Top parent subscription not found');

		return parse(StatementSubscriptionSchema, topParentSubscription);
	}

	async function getStatement() {
		let statement: Statement | undefined = store
			.getState()
			.statements.statements.find(
				(st: Statement) => st.statementId === statementId
			);

		if (!statement) {
			statement = await getStatementFromDB(statementId);
		}
		if (!statement) throw new Error('Statement not found');

		return parse(StatementSchema, statement);
	}
}

export function getNewStatementsFromSubscriptions(): Unsubscribe {
	try {
		const dispatch = store.dispatch;
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		if (!user.uid) throw new Error('User not logged in');

		//get the latest created statements
		const subscriptionsRef = collection(
			FireStore,
			Collections.statementsSubscribe
		);
		const q = query(
			subscriptionsRef,
			and(
				where('userId', '==', user.uid),
				where('statement.statementType', '!=', 'document'),
				or(
					where('role', '==', Role.admin),
					where('role', '==', Role.creator),
					where('role', '==', Role.member)
				)
			),
			orderBy('lastUpdate', 'desc'),
			limit(40)
		);

		return onSnapshot(q, (subscriptionsDB) => {
			subscriptionsDB.docChanges().forEach((change) => {
				const statementSubscription = parse(
					StatementSubscriptionSchema,
					change.doc.data()
				);

				if (change.type === 'added' || change.type === 'modified') {
					dispatch(setStatementSubscription(statementSubscription));
				}
				if (change.type === 'removed') {
					dispatch(
						deleteSubscribedStatement(
							statementSubscription.statementId
						)
					);
				}
			});
		});
	} catch (error) {
		console.error(error);

		return () => {};
	}
}
