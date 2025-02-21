import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { Access } from '@/types/TypeEnums';
import type { Statement } from '@/types/statement/Statement';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { getTopParentSubscriptionFromDByStatement } from '@/controllers/db/subscriptions/getSubscriptions';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { Role } from '@/types/user/UserSettings';
import { StatementSubscription } from '@/types/statement/StatementSubscription';

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

	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statementId)
	);
	const role = statementSubscription?.role || Role.unsubscribed;

	const checkAuthorization = async () => {
		if (!statement) {
			setState((prev) => ({ ...prev, loading: false, error: true }));

			return;
		}

		try {
			// Check statement authorization
			const isAuthorized = await isUserAuthorized(
				statement,
				statementSubscription
			);

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
		checkAuthorization();
	}, [statement, statementSubscription]);

	return state;
};

// Helper functions
async function isUserAuthorized(
	statement: Statement,
	subscription?: StatementSubscription
): Promise<boolean> {
	// Open access check
	if (
		statement.membership?.access === Access.open &&
		subscription?.role !== Role.banned
	) {
		if (!subscription) {
			await setStatementSubscriptionToDB(statement, Role.member);
		}

		return true;
	}

	// Closed access check
	if (statement.membership?.access === Access.close) {
		// Direct access check
		if (hasRequiredRole(statement, subscription?.role)) {
			return true;
		}

		// Parent subscription check
		const parentSubscription =
			await getTopParentSubscriptionFromDByStatement(statement);

		return hasRequiredRole(statement, parentSubscription?.role);
	}

	return false;
}

function hasRequiredRole(statement: Statement, role?: Role): boolean {
	const userId = store.getState().user.user?.uid;

	return (
		role === Role.admin ||
		role === Role.member ||
		statement.creatorId === userId
	);
}
