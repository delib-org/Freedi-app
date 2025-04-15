import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { setStatementSubscription, statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { useAuthentication } from './useAuthentication';
import { Access, Role, Statement, Creator, getStatementSubscriptionId } from 'delib-npm';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { getStatementSubscriptionFromDB } from '../db/subscriptions/getSubscriptions';
import { useDispatch, useSelector } from 'react-redux';
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
	const [isAuthorized, setIsAuthorized] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);

	const dispatch = useDispatch();
	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statementId)
	);
	const creator = useSelector(creatorSelector);
	const creatorId = creator?.uid;
	const role = statementSubscription?.role;

	useEffect(() => {

		if (!statementId) return;
		if (!creatorId) return;

		const unsubscribe = listenToStatementSubscription(statementId, creator);

		return () => {
			unsubscribe();
		};

	}, [creatorId, statementId]);

	// Handle authorization and role updates in a single effect
	useEffect(() => {
		if (statementSubscription && isMemberRole(statement, creatorId, role)) {

			setIsAuthorized(true);
			setLoading(false);
			setError(false);
			setErrorMessage('');

			return;

		} else if (role === Role.waiting) {
			setIsWaitingForApproval(true);
			setLoading(false);
			setError(false);
			setErrorMessage('');

			return;
		} else {
			if (isOpenToAll(statement, role) || isOpenToRegistered(statement, creator, role)) {
				setIsAuthorized(true);
				setStatementSubscriptionToDB({ statement, creator, role: Role.member });
				setError(false);
				setErrorMessage('');

				return;
			} else {
				if (isModeratedGroup(statement, role)) {
					setIsWaitingForApproval(true);
					setLoading(false);
					setStatementSubscriptionToDB({
						statement,
						creator,
						role: Role.waiting,
						getInAppNotification: false,
						getEmailNotification: false,
						getPushNotification: false,
					})
					setError(false);
					setErrorMessage('');
					setIsAuthorized(false);
					return;
				} else {
					setLoading(false);
					setError(true);
					setErrorMessage('You are not authorized to view this statement.');
					setIsAuthorized(false);
				}
			}
		}
	}, [statementSubscription]);

	return {
		isAuthorized,
		loading,
		error,
		errorMessage,
		creator,
		isWaitingForApproval
	};
};

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

function isAuthorized(
	statement: Statement,
	creator?: Creator,
	role?: Role
): boolean {
	if (!statement || !creator) return false;
	return isMemberRole(statement, creator.uid, role) || isOpenToAll(statement, role) || isOpenToRegistered(statement, creator, role);
}

function isOpenToAll(statement: Statement, role?: Role) {
	return role !== Role.banned && statement?.membership?.access === Access.openToAll;
}

function isOpenToRegistered(statement: Statement, creator: Creator, role: Role) {
	return role !== Role.banned && statement?.membership?.access === Access.openForRegistered && creator.isAnonymous === false;
}

function isModeratedGroup(statement: Statement, role?: Role) {
	return role !== Role.banned && statement?.membership?.access === Access.moderated;
}