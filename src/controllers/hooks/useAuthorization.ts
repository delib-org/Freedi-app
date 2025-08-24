import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { Access, Role, Statement, Creator } from 'delib-npm';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { listenToStatement, listenToStatementSubscription } from '../db/statements/listenToStatements';
import { notificationService } from '@/services/notificationService';

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
	const creator = useSelector(creatorSelector);
	const topParentId = statement?.topParentId;
	
	// SIMPLIFIED: Determine effective access - statement override or topParent
	const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;
	
	// Determine which subscription to use based on access override
	const subscriptionId = statement?.membership?.access ? statementId : statement?.topParentId;
	const subscription = useAppSelector(statementSubscriptionSelector(subscriptionId));
	const role = subscription?.role;

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

	// Set up subscription listener - listen to the correct subscription based on access override
	useEffect(() => {
		if (!statementId || !creator?.uid) return;

		// Listen to statement-specific subscription if it has its own access, otherwise topParent
		const subscriptionToListenId = statement?.membership?.access ? statementId : topParentId;
		const unsubscribe = listenToStatementSubscription(subscriptionToListenId, creator, setHasSubscription);

		return () => unsubscribe();
	}, [statementId, topParentId, creator?.uid, statement?.membership?.access]);

	useEffect(() => {
		// Determine which statement to use for subscription based on access override
		const effectiveStatement = statement?.membership?.access ? statement : topParentStatement;

		// if it is moderated group and user is not subscribed or not banned, set the subscription to waiting
		if (!hasSubscription && isModeratedGroup(effectiveStatement, role) && creator && effectiveStatement && role !== Role.banned) {
			setStatementSubscriptionToDB({
				statement: effectiveStatement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			})
		}
	}, [hasSubscription, statement, topParentStatement, creator, role]);

	// Handle authorization logic with simplified access check
	useEffect(() => {
		if (!statement || !creator) return;
		
		// Determine which statement to use for authorization
		const effectiveStatement = statement?.membership?.access ? statement : topParentStatement;
		
		// Special handling for public access
		if (effectiveAccess === Access.public) {
			setAuthState({
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
				role: role || Role.member,
				isAdmin: isAdminRole(role),
			});
			
			// Auto-subscribe if not already subscribed
			if (!hasSubscription && effectiveStatement && creator) {
				const pushNotificationsEnabled = notificationService.isInitialized() && 
					notificationService.safeGetPermission() === 'granted';
					
				setStatementSubscriptionToDB({
					statement: effectiveStatement,
					creator,
					role: Role.member,
					getInAppNotification: true,
					getEmailNotification: false,
					getPushNotification: pushNotificationsEnabled
				});
			}
			
			return;
		}

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
		if (isOpenAccess(effectiveStatement, creator, role) && effectiveStatement && creator) {
			// Check if user has granted push notification permission
			const pushNotificationsEnabled = notificationService.isInitialized() && 
				notificationService.safeGetPermission() === 'granted';

			setStatementSubscriptionToDB({
				statement: effectiveStatement,
				creator,
				role: Role.member,
				getInAppNotification: true,
				getEmailNotification: false,
				getPushNotification: pushNotificationsEnabled
			});

			setAuthState({
				isAuthorized: true,
				loading: false,
				role: Role.member,
				isAdmin: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false
			});

			return;
		}

		// Case 4: Moderated group - subscribe as waiting
		if (isModeratedGroup(effectiveStatement, role) && effectiveStatement && creator) {
			setStatementSubscriptionToDB({
				statement: effectiveStatement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			});

			setAuthState({
				isAuthorized: false,
				role: Role.waiting,
				isAdmin: false,
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
			isAdmin: false,
			loading: false,
			error: true,
			errorMessage: 'You are not authorized to view this statement.',
			creator,
			isWaitingForApproval: false
		});

	}, [statement, creator, subscription, role, topParentStatement, effectiveAccess, hasSubscription]);

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
		statement?.membership?.access === Access.public ||
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