import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { Access, Role, Statement, Creator } from 'delib-npm';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { listenToStatement, listenToStatementSubscription } from '../db/statements/listenToStatements';

export interface AuthorizationState {
	isAuthorized: boolean;
	role: Role;
	isAdmin: boolean;
	loading: boolean;
	error: boolean;
	errorMessage: string;
	creator?: Creator;
	isWaitingForApproval: boolean;
}

export const useAuthorization = (statementId?: string): AuthorizationState => {
	const [authState, setAuthState] = useState<AuthorizationState>({
		isAuthorized: false,
		role: Role.unsubscribed,
		isAdmin: false,
		loading: true,
		error: false,
		errorMessage: '',
		isWaitingForApproval: false
	});

	const [hasSubscription, setHasSubscription] = useState(false);

	const statement = useAppSelector(statementSelector(statementId));
	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
	const topParentSubscription = useAppSelector(statementSubscriptionSelector(statement?.topParentId));
	const creator = useSelector(creatorSelector);
	const role = topParentSubscription?.role;
	const topParentId = statement?.topParentId;

	console.log("useAuthorization", statementId, topParentId, role);

	//set up top parent statement listener
	useEffect(() => {

		if (!statementId || !topParentId) return;
		if (topParentStatement) return;

		// Fetch the top parent statement if it doesn't exist in the store
		const unsubscribe = listenToStatement(topParentId);

		return () => {
			unsubscribe();
		}
	}, [statementId, topParentId]);

	// Set up subscription listener
	useEffect(() => {
		if (!statementId || !creator?.uid) return;

		const unsubscribe = listenToStatementSubscription(topParentId, creator, setHasSubscription);

		return () => unsubscribe();
	}, [topParentId, creator?.uid]);

	useEffect(() => {

		// if it is moderated group and user is not subscribed or not banned, set the subscription to waiting
		if (!hasSubscription && isModeratedGroup(topParentStatement, role) && creator && role !== Role.banned) {
			setStatementSubscriptionToDB({
				statement: topParentStatement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			})
		}
	}, [hasSubscription, topParentStatement, creator, role]);

	// Handle authorization logic
	useEffect(() => {
		if (!statement || !creator) return;

		// Case 1: User is already a member or admin
		if (isMemberRole(statement, creator.uid, role)) {
			setAuthState({
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
				role,
				isAdmin: isAdminRole(role),
			});

			return;
		}

		// Case 2: User is waiting for approval
		if (role === Role.waiting) {

			setAuthState({
				isAuthorized: false,
				loading: false,
				role,
				isAdmin: isAdminRole(role),
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: true
			});

			return;
		}

		// Case 3: Open group - auto-subscribe as member
		if (isOpenAccess(topParentStatement, creator, role)) {

			setStatementSubscriptionToDB({
				statement: topParentStatement,
				creator,
				role: Role.member
			});

			setAuthState({
				isAuthorized: true,
				loading: false,
				role,
				isAdmin: isAdminRole(role),
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false
			});

			return;
		}

		// Case 4: Moderated group - subscribe as waiting
		if (isModeratedGroup(topParentStatement, role)) {

			setStatementSubscriptionToDB({
				statement: topParentStatement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			});

			setAuthState({
				isAuthorized: false,
				role: Role.banned,
				isAdmin: isAdminRole(role),
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
			role: Role.banned,
			isAdmin: isAdminRole(role),
			loading: false,
			error: true,
			errorMessage: 'You are not authorized to view this statement.',
			creator,
			isWaitingForApproval: false
		});

	}, [statement, creator, topParentSubscription, role, topParentStatement]);

	return authState;
};

// Helper functions
function isAdminRole(role: Role): boolean {
	return role === Role.admin || role === Role.creator;
}

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