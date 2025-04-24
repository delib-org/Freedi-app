import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { Access, Role, Statement, Creator } from 'delib-npm';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { listenToStatementSubscription } from '../db/statements/listenToStatements';

export interface AuthorizationState {
	isAuthorized: boolean;
	loading: boolean;
	error: boolean;
	errorMessage: string;
	creator?: Creator;
	isWaitingForApproval: boolean;
}

export const useAuthorization = (statementId?: string): AuthorizationState => {
	const [authState, setAuthState] = useState<AuthorizationState>({
		isAuthorized: false,
		loading: true,
		error: false,
		errorMessage: '',
		isWaitingForApproval: false
	});

	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(statementSubscriptionSelector(statementId));
	const creator = useSelector(creatorSelector);
	const role = statementSubscription?.role;

	// Set up subscription listener
	useEffect(() => {
		if (!statementId || !creator?.uid) return;

		const unsubscribe = listenToStatementSubscription(statementId, creator);

		return () => unsubscribe();
	}, [statementId, creator?.uid]);

	// Handle authorization logic
	useEffect(() => {
		if (!statement || !creator) return;

		// If we're waiting for subscription data and still loading
		// if (!statementSubscription && authState.loading) {

		// 	return;
		// }

		// Case 1: User is already a member or admin
		if (isMemberRole(statement, creator.uid, role)) {
			setAuthState({
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false
			});

			return;
		}

		// Case 2: User is waiting for approval
		if (role === Role.waiting) {

			setAuthState({
				isAuthorized: false,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: true
			});

			return;
		}

		// Case 3: Open group - auto-subscribe as member
		if (isOpenAccess(statement, creator, role)) {

			setStatementSubscriptionToDB({
				statement,
				creator,
				role: Role.member
			});

			setAuthState({
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false
			});

			return;
		}

		// Case 4: Moderated group - subscribe as waiting
		if (isModeratedGroup(statement, role)) {

			setStatementSubscriptionToDB({
				statement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			});

			setAuthState({
				isAuthorized: false,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: true
			});

			return;
		}

		// Case 5: Not authorized
		setAuthState({
			isAuthorized: false,
			loading: false,
			error: true,
			errorMessage: 'You are not authorized to view this statement.',
			creator,
			isWaitingForApproval: false
		});

	}, [statement, creator, statementSubscription, role]);

	return authState;
};

// Helper functions
function isMemberRole(
	statement: Statement,
	userId: string,
	role?: Role
): boolean {
	return (
		role === Role.admin ||
		role === Role.member ||
		statement?.creator?.uid === userId
	);
}

function isOpenAccess(
	statement: Statement,
	creator: Creator,
	role?: Role
): boolean {
	if (role === Role.banned) return false;

	return (
		statement?.membership?.access === Access.openToAll ||
		(statement?.membership?.access === Access.openForRegistered && creator.isAnonymous === false)
	);
}

function isModeratedGroup(
	statement: Statement,
	role?: Role
): boolean {
	return role !== Role.banned && statement?.membership?.access === Access.moderated;
}