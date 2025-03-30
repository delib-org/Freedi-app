import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { setStatementSubscription, statementSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { useAuthentication } from './useAuthentication';
import { Access, Role, Statement, Creator, getStatementSubscriptionId } from 'delib-npm';
import { setStatementSubscriptionToDB } from '../db/subscriptions/setSubscriptions';
import { getStatementSubscriptionFromDB } from '../db/subscriptions/getSubscriptions';
import { useDispatch } from 'react-redux';

export interface AuthorizationState {
	isAuthorized: boolean;
	loading: boolean;
	error: boolean;
	creator?: Creator;
}

export const useAuthorization = (statementId?: string): AuthorizationState => {
	const [state, setState] = useState<AuthorizationState>({
		isAuthorized: false,
		loading: true,
		error: false,
	});
	const dispatch = useDispatch();
	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statementId)
	);
	const role = statementSubscription?.role;

	const { creator } = useAuthentication();

	// Handle authorization and role updates in a single effect
	useEffect(() => {
		// If the subscription exists in Redux store
		if (statementSubscription) {

			// if the user is the creator or an admin or a member
			if (isAuthorized(statement, creator?.uid, role)) {

				setState((prevState) => ({
					...prevState,
					isAuthorized: true,
					loading: false,
					role,
				}));
				// if the statement is open and the user is not banned
			} else {

				setState((prevState) => ({
					...prevState,
					isAuthorized: false,
					loading: false
				}));
			}

			// If the subscription does not exist in Redux store
		} else if (!statementSubscription && statement?.membership?.access === Access.open && creator) {
			// Set loading state while creating subscription
			setState((prevState) => ({
				...prevState,
				loading: true,
			}));

			//check if the user is the subscribed to the statement
			const statementSubscriptionId = getStatementSubscriptionId(statement.statementId, creator);

			getStatementSubscriptionFromDB(statementSubscriptionId).then((subscription) => {
				if (subscription) {
					dispatch(setStatementSubscription(subscription));

					if (isAuthorized(statement, creator?.uid, subscription.role)) {
						setState((prevState) => ({
							...prevState,
							isAuthorized: true,
							loading: false,
						}));
					} else {
						setState((prevState) => ({
							...prevState,
							isAuthorized: false,
							loading: false,
						}));
					}
				} else {
					if (statement.membership?.access === Access.open) {
						// Create new subscription with member role
						setStatementSubscriptionToDB({
							statement,
							creator,
						});
						setState((prevState) => ({
							...prevState,
							isAuthorized: true,
							loading: false,
						}));
					} else {
						setState((prevState) => ({
							...prevState,
							isAuthorized: false,
							loading: false,
						}));
					}
				}
			});
		}
	}, [statementSubscription, statement, creator]);

	return {
		...state,
		creator,
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
	userId: string,
	role?: Role
): boolean {
	return isMemberRole(statement, userId, role) || role !== Role.banned && statement?.membership?.access === Access.open;
}