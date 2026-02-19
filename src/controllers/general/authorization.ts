import {
	StatementSubscription,
	Statement,
	Role,
	StatementType,
	QuestionType,
} from '@freedi/shared-types';
import { useAuthentication } from '../hooks/useAuthentication';
import { logError } from '@/utils/errorHandling';

export function isAuthorized(
	statement: Statement | undefined,
	statementSubscription: StatementSubscription | undefined,
	parentStatementCreatorId?: string | undefined,
	authorizedRoles?: Array<Role>,
) {
	try {
		if (!statement) throw new Error('No statement');

		const { user } = useAuthentication();
		if (!user) return false;

		if (isUserCreator(user.uid, statement, parentStatementCreatorId, statementSubscription)) {
			return true;
		}

		if (
			statementSubscription &&
			isUserAuthorizedByRole(statementSubscription.role, authorizedRoles)
		) {
			return true;
		}

		return false;
	} catch (error) {
		logError(error, { operation: 'general.helpers.isAuthorized' });

		return false;
	}
}

function isUserCreator(
	userId: string,
	statement: Statement,
	parentStatementCreatorId?: string,
	statementSubscription?: StatementSubscription,
): boolean {
	return (
		statement.creator?.uid === userId ||
		statement.creator?.uid === parentStatementCreatorId ||
		statement.creator?.uid === statementSubscription?.userId
	);
}

function isUserAuthorizedByRole(role: Role, authorizedRoles?: Array<Role>): boolean {
	return role === Role.admin || (authorizedRoles?.includes(role) ?? false);
}

export function isAdmin(role: Role | undefined): boolean {
	if (role === Role.admin || role === Role.creator) return true;

	return false;
}

export function isChatMessage(statementType: StatementType): boolean {
	if (statementType === StatementType.statement) return true;

	return false;
}

export function isMassConsensus(questionType: QuestionType): boolean {
	if (questionType === QuestionType.massConsensus) return true;

	return false;
}
