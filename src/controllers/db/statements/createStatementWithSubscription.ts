import {
	Statement,
	QuestionType,
	Role,
	getStatementSubscriptionId,
	StatementType,
	Creator,
	Paragraph,
} from '@freedi/shared-types';
import { createStatement, setStatementToDB } from './setStatements';
import { setStatement, setStatementSubscription } from '@/redux/statements/statementsSlice';
import { Dispatch } from '@reduxjs/toolkit';
import { setStatementSubscriptionToDB } from '@/controllers/db/subscriptions/setSubscriptions';
import { notificationService } from '@/services/notificationService';
import { validateStatementTypeHierarchy } from '@/controllers/general/helpers';

interface CreateStatementWithSubscriptionParams {
	newStatementParent: Statement | 'top';
	title: string;
	paragraphs?: Paragraph[];
	newStatement: Partial<Statement> | null;
	newStatementQuestionType: QuestionType;
	currentLanguage: string;
	user: Creator;
	dispatch: Dispatch;
}

export async function createStatementWithSubscription({
	newStatementParent,
	title,
	paragraphs,
	newStatement,
	newStatementQuestionType,
	currentLanguage,
	user,
	dispatch,
}: CreateStatementWithSubscriptionParams): Promise<string> {
	const statementType = newStatement?.statementType || StatementType.question;

	// Validate type hierarchy before creating the statement
	const validation = validateStatementTypeHierarchy(newStatementParent, statementType);
	if (!validation.allowed) {
		throw new Error(validation.reason || `Cannot create ${statementType} under this parent`);
	}

	const lang = newStatementQuestionType === QuestionType.massConsensus ? currentLanguage : '';

	const _newStatement: Statement | undefined = createStatement({
		parentStatement: newStatementParent,
		text: title,
		paragraphs,
		defaultLanguage: lang,
		statementType,
		questionType: newStatementQuestionType,
	});

	if (!_newStatement) throw new Error('Failed to create statement');

	// Carry over compound settings if creating a compound question
	if (newStatement?.questionSettings?.compoundSettings) {
		_newStatement.questionSettings = {
			..._newStatement.questionSettings,
			compoundSettings: newStatement.questionSettings.compoundSettings,
		};
	}

	// Immediately add to Redux with optimistic state
	const now = new Date().getTime();
	dispatch(setStatement(_newStatement));
	dispatch(
		setStatementSubscription({
			role: Role.admin,
			statement: _newStatement,
			statementsSubscribeId: getStatementSubscriptionId(_newStatement.statementId, user),
			statementId: _newStatement.statementId,
			user: {
				uid: user.uid,
				displayName: user.displayName || '',
				email: user.email || '',
				photoURL: user.photoURL || '',
			},
			lastUpdate: now,
			createdAt: now,
			userId: user?.uid || '',
		}),
	);

	// Then save to database in the background
	const result = await setStatementToDB({
		parentStatement: newStatementParent,
		statement: _newStatement,
	});

	if (!result) {
		// Check browser console for detailed error from setStatementToDB
		throw new Error('Failed to save statement to database - check console for details');
	}

	const { statementId } = result;

	// Create subscription in Firestore with push notifications enabled if user has granted permission
	const pushNotificationsEnabled =
		notificationService.isInitialized() && notificationService.safeGetPermission() === 'granted';

	await setStatementSubscriptionToDB({
		statement: _newStatement,
		creator: user,
		role: Role.admin,
		getInAppNotification: true,
		getEmailNotification: false,
		getPushNotification: pushNotificationsEnabled,
	});

	return statementId;
}
