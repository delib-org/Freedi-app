import {
	getCountFromServer,
	getDocs,
	limit,
	orderBy,
	Query,
	query,
	QueryConstraint,
	startAfter,
	where,
} from 'firebase/firestore';
import { Collections, StatementSubscription } from '@freedi/shared-types';
import { FIREBASE } from '@/constants/common';
import { NON_DOCUMENT_STATEMENT_TYPES } from '@/helpers/statementTypeHelpers';
import { setMembership } from '@/redux/statements/statementsSlice';
import { AppDispatch } from '@/redux/store';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { DatabaseError, logError } from '@/utils/errorHandling';

const OPERATION = 'membership.membersPage';

/**
 * The subscriptions of one space, newest first. The live members listener
 * reads the first page of this query; older pages are fetched once on demand
 * and the total comes from an aggregation, so a large space costs one read per
 * person actually shown plus one for the count — never the whole collection.
 */
export function membersOfStatementQuery(
	statementId: string,
	...constraints: QueryConstraint[]
): Query {
	return query(
		createCollectionRef(Collections.statementsSubscribe),
		where('statementId', '==', statementId),
		where('statementType', 'in', NON_DOCUMENT_STATEMENT_TYPES),
		orderBy('createdAt', 'desc'),
		...constraints,
	);
}

/** How many subscriptions the space has in Firestore (one aggregation read per 1,000). */
export async function countMembers(statementId: string): Promise<number> {
	try {
		const snapshot = await getCountFromServer(membersOfStatementQuery(statementId));

		return snapshot.data().count;
	} catch (error) {
		logError(error, { operation: `${OPERATION}.countMembers`, statementId });
		throw new DatabaseError('Could not count members', { operation: OPERATION, statementId });
	}
}

interface LoadMembersPageOptions {
	statementId: string;
	/** `createdAt` of the oldest subscription already loaded. */
	afterCreatedAt: number;
	pageSize?: number;
}

/**
 * Fetches the next page of older subscriptions (one-shot, not live) into
 * Redux. Returns how many arrived; fewer than `pageSize` means the end.
 */
export const loadMembersPage =
	(dispatch: AppDispatch) =>
	async ({
		statementId,
		afterCreatedAt,
		pageSize = FIREBASE.QUERY_LIMIT_DEFAULT,
	}: LoadMembersPageOptions): Promise<number> => {
		try {
			const snapshot = await getDocs(
				membersOfStatementQuery(statementId, startAfter(afterCreatedAt), limit(pageSize)),
			);
			snapshot.docs.forEach((doc) => dispatch(setMembership(doc.data() as StatementSubscription)));

			return snapshot.size;
		} catch (error) {
			logError(error, {
				operation: `${OPERATION}.loadMembersPage`,
				statementId,
				metadata: { afterCreatedAt, pageSize },
			});
			throw new DatabaseError('Could not load more members', {
				operation: OPERATION,
				statementId,
			});
		}
	};
