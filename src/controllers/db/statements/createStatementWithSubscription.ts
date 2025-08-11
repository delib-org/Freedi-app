import { Statement, QuestionType, Role, getStatementSubscriptionId, StatementType, Creator } from 'delib-npm';
import { createStatement, setStatementToDB } from './setStatements';
import { setStatement, setStatementSubscription } from '@/redux/statements/statementsSlice';
import { Dispatch } from '@reduxjs/toolkit';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { notificationService } from '@/services/notificationService';

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

	// Immediately add to Redux with optimistic state
	const now = new Date().getTime();
	dispatch(setStatement(_newStatement));
	dispatch(setStatementSubscription({
		role: Role.admin,
		statement: _newStatement,
		statementsSubscribeId: getStatementSubscriptionId(_newStatement.statementId, user),
		statementId: _newStatement.statementId,
		user: user,
		lastUpdate: now,
		createdAt: now,
		userId: user?.uid || '',
	}));

	// Then save to database in the background
	const { statementId } = await setStatementToDB({
		parentStatement: newStatementParent,
		statement: _newStatement,
	});

	// Create subscription in Firestore with push notifications enabled if user has granted permission
	const pushNotificationsEnabled = notificationService.isInitialized() && 
		notificationService.safeGetPermission() === 'granted';
	
	await setStatementSubscriptionToDB({
		statement: _newStatement,
		creator: user,
		role: Role.admin,
		getInAppNotification: true,
		getEmailNotification: false,
		getPushNotification: pushNotificationsEnabled
	});

	return statementId;
}
