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
import {
	getEntryVerdict,
	getLevelAccess,
	getSubscriptionScopeId,
	isAdminRole,
	isMemberOfLevel,
} from '@/helpers/entryVerdict';

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
	// The level whose setting decides, as the database rules read it.
	const governingId = getSubscriptionScopeId(statement);
	const governingStatement = useAppSelector(statementSelector(governingId));
	const creator = useSelector(creatorSelector);

	// Extract primitive values for stable comparisons
	const effectiveAccess = getLevelAccess(statement, governingStatement);
	const statementCreatorUid = statement?.creator?.uid;
	const creatorUid = creator?.uid;
	const creatorIsAnonymous = creator?.isAnonymous;

	const subscription = useAppSelector(statementSubscriptionSelector(governingId));
	const role = subscription?.role;

	// Set up the governing statement listener
	useEffect(() => {
		if (!statementId || !governingId) return;
		if (governingStatement) return;

		const unsubscribe = listenToStatement(governingId);

		return () => {
			unsubscribe();
		};
	}, [statementId, governingId, !!governingStatement]);

	// Set up subscription listener
	useEffect(() => {
		if (!statementId || !creatorUid) return;

		const unsubscribe = listenToStatementSubscription(governingId, creator, setHasSubscription);

		return () => unsubscribe();
	}, [statementId, creatorUid, governingId]);

	// Handle authorization logic
	useEffect(() => {
		if (!statementId || !creatorUid) return;

		const effectiveStatement = governingStatement;

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

		const verdict = getEntryVerdict(statement, governingStatement, subscription, creator);

		if (verdict === 'open') {
			const isPublic = effectiveAccess === Access.public;
			const isMember = isMemberOfLevel(statement, role, creator);
			const newState = {
				isAuthorized: true,
				loading: false,
				error: false,
				errorMessage: '',
				creator,
				isWaitingForApproval: false,
				role: isMember && !isPublic ? role : role || Role.member,
				isAdmin: isAdminRole(role),
			};

			if (shouldUpdate(newState)) {
				setAuthState(newState);
			}

			// Public and open groups auto-subscribe once; members already belong
			const joinsOnEntry = isPublic || !isMember;
			if (
				joinsOnEntry &&
				!hasSubscription &&
				!subscriptionAttemptedRef.current &&
				effectiveStatement &&
				creator
			) {
				subscriptionAttemptedRef.current = true;
				setStatementSubscriptionToDB({
					statement: effectiveStatement,
					creator,
					role: Role.member,
					getInAppNotification: true,
					getEmailNotification: false,
					...notificationService.getPushSubscriptionFields(),
				});
			}

			return;
		}

		if (verdict === 'waiting') {
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

		// If we don't know the access level yet, stay in loading state
		if (!effectiveAccess) {
			const newState = {
				isAuthorized: false,
				role: Role.unsubscribed,
				isAdmin: false,
				loading: true,
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
		governingId,
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
function isModeratedGroup(access: Access | undefined, role?: Role): boolean {
	return role !== Role.banned && access === Access.moderated;
}
