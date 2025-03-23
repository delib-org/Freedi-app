import { useState, useEffect } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import {statementSelector,	statementSubscriptionSelector} from '@/redux/statements/statementsSlice';
import { useAuthentication } from './useAuthentication';
import { Access, Role, Statement, Creator } from 'delib-npm';

export interface AuthorizationState {
	isAuthorized: boolean;
	loading: boolean;
	error: boolean;
	role?: Role;
	creator?: Creator;
}

export const useAuthorization = (statementId?: string): AuthorizationState => {

	const [state, setState] = useState<AuthorizationState>({
		isAuthorized: false,
		loading: true,
		error: false,
	});

	const statement = useAppSelector(statementSelector(statementId));
	const statementSubscription = useAppSelector(
		statementSubscriptionSelector(statementId)
	);
	const { creator } = useAuthentication();

	//check if there is statement and statement subscription on redux, else get from DB

	//Listen to statement subscription
	useEffect(() => {

		setState((prevState) => ({
			...prevState,
			creator,
		}));

	}, [creator]);

	useEffect(() => {
		if (statementSubscription) {
			const { role } = statementSubscription;

			// if the user is the creator or an admin or a member
			if (isMemberRole(statement, creator?.uid, role)) {

				setState((prevState) => ({
					...prevState,
					isAuthorized: true,
					loading: false,
				}));
				// if the statement is open and the user is not banned
			} else if (role !== Role.banned && statement?.membership?.access === Access.open) {

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
	}, [statementSubscription?.role, statement?.membership?.access]);

	return state;
};

function isMemberRole(
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
