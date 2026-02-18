import { useState, useEffect, useRef } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { Access, Role, Creator } from '@freedi/shared-types';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	listenToStatement,
	listenToStatementSubscription,
} from '../db/statements/listenToStatements';
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
		isWaitingForApproval: false,
	});

	const [hasSubscription, setHasSubscription] = useState(false);

	// Use refs to track subscription attempts and prevent loops
	const subscriptionAttemptedRef = useRef(false);
	const lastStatementIdRef = useRef<string | undefined>(undefined);

	// Reset subscription attempt when statementId changes (in useEffect, not render body)
	useEffect(() => {
		if (statementId !== lastStatementIdRef.current) {
			lastStatementIdRef.current = statementId;
			subscriptionAttemptedRef.current = false;
		}
	}, [statementId]);

	const statement = useAppSelector(statementSelector(statementId));
	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
	const creator = useSelector(creatorSelector);
	const topParentId = statement?.topParentId;

	// Extract primitive values for stable comparisons
	const statementAccess = statement?.membership?.access;
	const topParentAccess = topParentStatement?.membership?.access;
	const effectiveAccess = statementAccess || topParentAccess;
	const statementCreatorUid = statement?.creator?.uid;
	const creatorUid = creator?.uid;
	const creatorIsAnonymous = creator?.isAnonymous;

	// Determine which subscription to use based on access override
	const subscriptionId = statementAccess ? statementId : topParentId;
	const subscription = useAppSelector(statementSubscriptionSelector(subscriptionId));
	const role = subscription?.role;

	// Set up top parent statement listener
	useEffect(() => {
		if (!statementId || !topParentId) return;
		if (topParentStatement) return;

		const unsubscribe = listenToStatement(topParentId);

		return () => {
			unsubscribe();
		};
	}, [statementId, topParentId, !!topParentStatement]);

	// Set up subscription listener
	useEffect(() => {
		if (!statementId || !creatorUid) return;

		const subscriptionToListenId = statementAccess ? statementId : topParentId;
		const unsubscribe = listenToStatementSubscription(
			subscriptionToListenId,
			creator,
			setHasSubscription,
		);

		return () => unsubscribe();
	}, [statementId, topParentId, creatorUid, statementAccess]);

	// Handle authorization logic
	useEffect(() => {
		if (!statementId || !creatorUid) return;

		const effectiveStatement = statementAccess ? statement : topParentStatement;

		// Helper to check if we should update state
		const shouldUpdate = (newState: Partial<AuthorizationState>) => {
			return (
				authState.isAuthorized !== newState.isAuthorized ||
				authState.loading !== newState.loading ||
				authState.role !== newState.role ||
				authState.isWaitingForApproval !== newState.isWaitingForApproval ||
				authState.error !== newState.error
			);
		};

		// Special handling for public access
		if (effectiveAccess === Access.public) {
			const newState = {
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
				role: role || Role.member,
				isAdmin: isAdminRole(role),
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			// Auto-subscribe only once
			if (!hasSubscription && !subscriptionAttemptedRef.current && effectiveStatement && creator) {
				subscriptionAttemptedRef.current = true;
				const pushNotificationsEnabled =
					notificationService.isInitialized() &&
					notificationService.safeGetPermission() === 'granted';

				setStatementSubscriptionToDB({
					statement: effectiveStatement,
					creator,
					role: Role.member,
					getInAppNotification: true,
					getEmailNotification: false,
					getPushNotification: pushNotificationsEnabled,
				});
			}

			return;
		}

		// Case 1: User is already a member or admin
		if (isMemberRole(statementCreatorUid, creatorUid, role)) {
			const newState = {
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
				role,
				isAdmin: isAdminRole(role),
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			return;
		}

		// Case 2: User is waiting for approval
		if (role === Role.waiting) {
			const newState = {
				isAuthorized: false,
				loading: false,
				role,
				isAdmin: isAdminRole(role),
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: true,
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			return;
		}

		// Case 3: Open group - auto-subscribe as member
		if (
			isOpenAccess(effectiveAccess, creatorIsAnonymous, role) &&
			effectiveStatement &&
			creator &&
			!subscriptionAttemptedRef.current
		) {
			subscriptionAttemptedRef.current = true;

			const pushNotificationsEnabled =
				notificationService.isInitialized() &&
				notificationService.safeGetPermission() === 'granted';

			setStatementSubscriptionToDB({
				statement: effectiveStatement,
				creator,
				role: Role.member,
				getInAppNotification: true,
				getEmailNotification: false,
				getPushNotification: pushNotificationsEnabled,
			});

			const newState = {
				isAuthorized: true,
				loading: false,
				role: Role.member,
				isAdmin: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			return;
		}

		// Case 4: Moderated group - subscribe as waiting
		if (
			isModeratedGroup(effectiveAccess, role) &&
			effectiveStatement &&
			creator &&
			!subscriptionAttemptedRef.current
		) {
			subscriptionAttemptedRef.current = true;

			setStatementSubscriptionToDB({
				statement: effectiveStatement,
				creator,
				role: Role.waiting,
				getInAppNotification: false,
				getEmailNotification: false,
				getPushNotification: false,
			});

			const newState = {
				isAuthorized: false,
				role: Role.waiting,
				isAdmin: false,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: true,
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			return;
		}

		// Case 5: Not authorized
		const newState = {
			isAuthorized: false,
			role: Role.banned,
			isAdmin: false,
			loading: false,
			error: true,
			errorMessage: 'You are not authorized to view this statement.',
			creator,
			isWaitingForApproval: false,
		};

		if (shouldUpdate(newState)) {
			setAuthState(newState);
		}
	}, [
		statementId,
		statementAccess,
		statementCreatorUid,
		creatorUid,
		creatorIsAnonymous,
		role,
		effectiveAccess,
		hasSubscription,
	]);

	return authState;
};

// Helper functions
function isAdminRole(role?: Role): boolean {
	return role === Role.admin || role === Role.creator;
}

function isMemberRole(
	statementCreatorUid: string | undefined,
	userId: string | undefined,
	role?: Role,
): boolean {
	return (
		role === Role.admin ||
		role === Role.member ||
		(!!statementCreatorUid && !!userId && statementCreatorUid === userId)
	);
}

function isOpenAccess(
	access: Access | undefined,
	creatorIsAnonymous: boolean | undefined,
	role?: Role,
): boolean {
	if (role === Role.banned) return false;

	return (
		access === Access.public ||
		access === Access.openToAll ||
		(access === Access.openForRegistered && creatorIsAnonymous === false)
	);
}

function isModeratedGroup(access: Access | undefined, role?: Role): boolean {
	return role !== Role.banned && access === Access.moderated;
}
