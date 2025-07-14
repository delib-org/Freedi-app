import { Statement, QuestionType, Role, getStatementSubscriptionId, StatementType, Creator } from 'delib-npm';
import { createStatement, setStatementToDB } from './setStatements';
import { setStatement, setStatementSubscription } from '@/redux/statements/statementsSlice';
import { Dispatch } from '@reduxjs/toolkit';

interface CreateStatementWithSubscriptionParams {
	newStatementParent: Statement | 'top';
	title: string;
	description: string;
	newStatement: Partial<Statement> | null;
	newStatementQuestionType: QuestionType;
	currentLanguage: string;
	user: Creator;
	dispatch: Dispatch;
}

export async function createStatementWithSubscription({
	newStatementParent,
	title,
	description,
	newStatement,
	newStatementQuestionType,
	currentLanguage,
	user,
	dispatch,
}: CreateStatementWithSubscriptionParams): Promise<string> {
	const lang =
		newStatementQuestionType === QuestionType.massConsensus
			? currentLanguage
			: '';

	const _newStatement: Statement | undefined = createStatement({
		parentStatement: newStatementParent,
		text: title,
		description,
		defaultLanguage: lang,
		statementType: newStatement?.statementType || StatementType.group,
		questionType: newStatementQuestionType,
	});

	if (!_newStatement) throw new Error('newStatement is not defined');

	const { statementId } = await setStatementToDB({
		parentStatement: newStatementParent,
		statement: _newStatement,
	});

	dispatch(setStatement(_newStatement));
	const now = new Date().getTime();
	dispatch(setStatementSubscription({
		role: Role.admin,
		statement: _newStatement,
		statementsSubscribeId: getStatementSubscriptionId(statementId, user),
		statementId: statementId,
		user: user,
		lastUpdate: now,
		createdAt: now,
		userId: user?.uid || '',
	}));

	return statementId;
}
