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
	StatementSubscription,
	Role,
	Collections,
	StatementType,
	DeliberativeElement,
	Statement,
	StatementSchema,
	Creator,
} from 'delib-npm';

import { parse } from 'valibot';
import React from 'react';

// Helpers
export const listenToStatementSubscription = (
	statementId: string,
	creator: Creator,
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		const statementsSubscribeRef = doc(
			FireStore,
			Collections.statementsSubscribe,
			`${creator.uid}--${statementId}`
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

function getStack() {
	const stack = new Error().stack;

	return stack;
}

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
	statementId: string | undefined,
	topBottom?: 'top' | 'bottom',
	numberOfOptions?: number
): Unsubscribe => {
	try {
		const dispatch = store.dispatch;
		if (!statementId) throw new Error('Statement id is undefined');
		const statementsRef = collection(FireStore, Collections.statements);

		// Reduce the initial load to 25 items for faster initial loading
		// This should be enough for most use cases while dramatically improving load time
		const descAsc = topBottom === 'top' ? 'desc' : 'asc';

		const q = query(
			statementsRef,
			where('parentId', '==', statementId),
			where('statementType', '!=', StatementType.document),
			orderBy('createdAt', descAsc),
			limit(numberOfOptions)
		);

		let isFirstCall = true;

		return onSnapshot(q, (statementsDB) => {
			// For the first call, batch process all statements at once
			if (isFirstCall) {
				const startStatements: Statement[] = [];

				statementsDB.forEach((doc) => {
					const statement = doc.data() as Statement;
					startStatements.push(statement);
				});

				// Dispatch all statements at once instead of individually
				if (startStatements.length > 0) {
					dispatch(setStatements(startStatements));
				}

				isFirstCall = false;
			} else {
				// After initial load, handle individual changes
				statementsDB.docChanges().forEach((change) => {
					const statement = change.doc.data() as Statement;

					if (change.type === 'added') {
						dispatch(setStatement(statement));
					} else if (change.type === 'modified') {
						dispatch(setStatement(statement));
					} else if (change.type === 'removed') {
						dispatch(deleteStatement(statement.statementId));
					}
				});
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
			const q = query(
				membersRef,
				where('statementId', '==', statementId),
				where('statement.statementType', '!=', StatementType.document),
				orderBy('createdAt', 'desc')
			);

			return onSnapshot(q, (subsDB) => {
				subsDB.docChanges().forEach((change) => {
					const member = change.doc.data() as StatementSubscription;
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

export function listenToAllSubStatements(
	statementId: string,
	numberOfLastMessages = 7
) {
	try {
		if (numberOfLastMessages > 25) numberOfLastMessages = 25;
		if (!statementId) throw new Error('Statement id is undefined');

		const statementsRef = collection(FireStore, Collections.statements);
		const q = query(
			statementsRef,
			where('topParentId', '==', statementId),
			where('statementId', '!=', statementId),
			orderBy('createdAt', 'desc'),
			limit(numberOfLastMessages)
		);

		return onSnapshot(q, (statementsDB) => {
			statementsDB.docChanges().forEach((change) => {
				const statement = parse(StatementSchema, change.doc.data());

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
		const statementsRef = collection(FireStore, Collections.statements);
		const q = query(
			statementsRef,
			and(
				or(
					where(
						'deliberativeElement',
						'==',
						DeliberativeElement.option
					),
					where(
						'deliberativeElement',
						'==',
						DeliberativeElement.research
					)
				),
				where('parents', 'array-contains', statementId)
			),
			// Increase performance by limiting batch size
			limit(50)
		);

		// Use batched updates for better performance
		let isFirstBatch = true;
		const statements: Statement[] = [];

		return onSnapshot(q, (statementsDB) => {
			if (isFirstBatch) {
				// Process the initial batch of statements all at once
				statementsDB.forEach((doc) => {
					const statement = parse(StatementSchema, doc.data());
					statements.push(statement);
				});

				// Dispatch all statements at once instead of one by one
				if (statements.length > 0) {
					store.dispatch(setStatements(statements));
				}

				isFirstBatch = false;
			} else {
				// After initial load, process changes individually
				statementsDB.docChanges().forEach((change) => {
					const statement = parse(StatementSchema, change.doc.data());

					if (
						change.type === 'added' ||
						change.type === 'modified'
					) {
						store.dispatch(setStatement(statement));
					} else if (change.type === 'removed') {
						store.dispatch(deleteStatement(statement.statementId));
					}
				});
			}
		});
	} catch (error) {
		console.error(error);

		return (): void => {
			return;
		};
	}
}
