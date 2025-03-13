import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { getTopParentSubscriptionFromDByStatement } from '@/controllers/db/subscriptions/getSubscriptions';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { useAuthentication } from './useAuthentication';
import { useNavigate } from 'react-router';
import { Access, Role, Statement, StatementSubscription, Creator } from 'delib-npm';

export interface AuthorizationState {
	isAuthorized: boolean;
	loading: boolean;
	error: boolean;
	statement?: Statement;
	statementSubscription?: StatementSubscription;
	topParentStatement?: Statement;
	role?: Role;
}

export const useAuthorization = (statementId?: string) => {
	const [state, setState] = useState<AuthorizationState>({
		isAuthorized: false,
		loading: true,
		error: false,
	});

	const navigation = useNavigate();

	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statementId)
	);
	const role = statementSubscription?.role || Role.unsubscribed;
	const { creator } = useAuthentication();

	const checkAuthorization = async () => {
		if (!statement) {
			setState((prev) => ({ ...prev, loading: false, error: true }));

			return;
		}

		try {
			// Check statement authorization
			const isAuthorized = await isUserAuthorized(
				statement,
				creator,
				statementSubscription
			);

			if (!isAuthorized) {
				navigation('/401');
			}

			// Get top parent statement if needed
			let topParentStatement: Statement | undefined;
			if (statement.topParentId) {
				topParentStatement = await getStatementFromDB(
					statement.topParentId
				);
			}

			setState({
				isAuthorized,
				loading: false,
				error: !isAuthorized,
				statement,
				statementSubscription,
				topParentStatement,
				role,
			});
		} catch (error) {
			console.error('Authorization check failed:', error);
			setState((prev) => ({ ...prev, loading: false, error: true }));
		}
	};

	useEffect(() => {
		if (!creator) return;
		checkAuthorization();
	}, [statement, statementSubscription, creator]);

	return state;
};

// Helper functions
async function isUserAuthorized(
	statement: Statement,
	creator: Creator,
	subscription?: StatementSubscription
): Promise<boolean> {
	// Open access check
	if (
		statement.membership?.access === Access.open &&
		subscription?.role !== Role.banned
	) {
		if (!subscription) {
			await setStatementSubscriptionToDB(statement, creator, Role.member);
		}

		return true;
	}

	// Closed access check
	if (statement.membership?.access === Access.close) {
		// Direct access check
		if (hasRequiredRole(statement, creator.uid, subscription?.role)) {
			return true;
		}

		// Parent subscription check
		const parentSubscription =
			await getTopParentSubscriptionFromDByStatement(
				statement,
				creator.uid
			);

		return hasRequiredRole(
			statement,
			creator.uid,
			parentSubscription?.role
		);
	}

	return false;
}

function hasRequiredRole(
	statement: Statement,
	userId: string,
	role?: Role
): boolean {
	return (
		role === Role.admin ||
		role === Role.member ||
		statement.creator.uid === userId
	);
}
