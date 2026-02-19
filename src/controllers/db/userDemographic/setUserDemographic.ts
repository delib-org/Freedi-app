import {
	Collections,
	DemographicOption,
	DemographicOptionSchema,
	Statement,
	UserDemographicQuestion,
	UserDemographicQuestionSchema,
} from '@freedi/shared-types';
import {
	arrayRemove,
	arrayUnion,
	deleteDoc,
	doc,
	setDoc,
	updateDoc,
	writeBatch,
} from 'firebase/firestore';
import { DB } from '../config';
import { parse, safeParse } from 'valibot';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import {
	deleteUserDemographicQuestion as deleteUserDemographicQuestionAction,
	setUserDemographicQuestion as setUserDemographicQuestionAction,
} from '@/redux/userDemographic/userDemographicSlice';
import type { BaseSchema } from 'valibot';

export async function setUserDemographicQuestion(
	statement: Statement,
	question: UserDemographicQuestion,
) {
	try {
		if (!statement || !question) {
			throw new Error('Statement and question must be provided');
		}
		parse(UserDemographicQuestionSchema, question);
		const dispatch = store.dispatch;

		const questionsRef = doc(DB, Collections.userDemographicQuestions, question.userQuestionId);

		await setDoc(questionsRef, question, {
			merge: true,
		});

		dispatch(setUserDemographicQuestionAction(question));
	} catch (error) {
		logError(error, { operation: 'userDemographic.setUserDemographicQuestion' });
	}
}

export async function deleteUserDemographicQuestion(question: UserDemographicQuestion) {
	try {
		if (!question || !question.userQuestionId) {
			throw new Error('Question and question ID must be provided');
		}

		const questionsRef = doc(DB, Collections.userDemographicQuestions, question.userQuestionId);

		await deleteDoc(questionsRef);

		store.dispatch(deleteUserDemographicQuestionAction(question.userQuestionId));
	} catch (error) {
		logError(error, { operation: 'userDemographic.deleteUserDemographicQuestion' });
	}
}

export async function setUserDemographicOption(
	question: UserDemographicQuestion,
	option: DemographicOption,
) {
	try {
		if (!question || !question.userQuestionId || !option) {
			throw new Error('Question ID and option must be provided');
		}

		const results = safeParse(UserDemographicQuestionSchema, question);
		if (!results.success) {
			logError(new Error('Invalid question data'), { operation: 'userDemographic.setUserDemographicOption', metadata: { issues: results.issues } });
			throw new Error('Invalid question data');
		}

		const resultsOption = safeParse(DemographicOptionSchema, option);
		if (!resultsOption.success) {
			logError(new Error('Invalid option data'), { operation: 'userDemographic.setUserDemographicOption', metadata: { issues: resultsOption.issues } });
			throw new Error('Invalid option data');
		}

		const questionsRef = doc(DB, Collections.userDemographicQuestions, question.userQuestionId);

		// Use arrayUnion for atomic, concurrent-safe option addition
		await updateDoc(questionsRef, {
			options: arrayUnion(option),
		});

		return;
	} catch (error) {
		logError(error, { operation: 'userDemographic.setUserDemographicOption' });
	}
}

export async function deleteUserDemographicOption(
	question: UserDemographicQuestion,
	option: string,
) {
	try {
		if (!question || !question.userQuestionId || !option) {
			throw new Error('Question ID and option must be provided');
		}

		// Find the full option object to use with arrayRemove
		const optionToRemove = question.options?.find((opt) => opt.option === option);
		if (!optionToRemove) return;

		const questionsRef = doc(DB, Collections.userDemographicQuestions, question.userQuestionId);

		// Use arrayRemove for atomic, concurrent-safe option removal
		await updateDoc(questionsRef, {
			options: arrayRemove(optionToRemove),
		});

		return;
	} catch (error) {
		logError(error, { operation: 'userDemographic.deleteUserDemographicOption' });
	}
}

export async function setUserAnswers(answers: UserDemographicQuestion[]) {
	try {
		if (!answers || !Array.isArray(answers)) {
			throw new Error('Answers must be an array');
		}

		const dispatch = store.dispatch;
		const user = store.getState().creator?.creator;
		if (!user || !user.uid) {
			throw new Error('User must be logged in to set answers');
		}
		const { uid } = user;
		const batch = writeBatch(DB);

		for (const answer of answers) {
			answer.userId = uid; // Ensure userId is set
			const { isValid } = validateDataAndLogIssues(UserDemographicQuestionSchema, answer);
			if (!isValid) throw new Error('Invalid answer data');

			const questionRef = doc(DB, Collections.usersData, `${answer.userQuestionId}--${uid}`);
			batch.set(questionRef, answer, { merge: true });
			dispatch(setUserDemographicQuestionAction(answer));
		}

		await batch.commit();
	} catch (error) {
		logError(error, { operation: 'userDemographic.setUserAnswers' });
	}
}

export function validateDataAndLogIssues<T>(
	schema: BaseSchema<any, T, any>,
	data: unknown,
): { isValid: boolean; validData?: T } {
	const result = safeParse(schema, data);

	if (!result.success) {
		console.info('Validation failed!');
		console.info('Issues:', result.issues);

		// Print each issue in detail
		result.issues.forEach((issue, index) => {
			console.info(`Issue ${index + 1}:`);
			console.info('  Path:', issue.path?.map((p) => p.key).join('.') || 'root');
			console.info('  Message:', issue.message);
			console.info('  Expected:', issue.expected);
			console.info('  Received:', issue.received);
			console.info('  Input:', issue.input);
		});

		return { isValid: false };
	}

	return { isValid: true, validData: result.output };
}

export function setDemographicOptionColor(
	userQuestion: UserDemographicQuestion,
	option: DemographicOption,
) {
	if (!userQuestion || !userQuestion.userQuestionId || !option) {
		throw new Error('User question ID and option must be provided');
	}

	const results = safeParse(UserDemographicQuestionSchema, userQuestion);
	if (!results.success) {
		logError(new Error('Invalid user question data'), { operation: 'userDemographic.setDemographicOptionColor', metadata: { issues: results.issues } });
		throw new Error('Invalid user question data');
	}

	const questionsRef = doc(DB, Collections.userDemographicQuestions, userQuestion.userQuestionId);

	updateDoc(questionsRef, {
		options: userQuestion.options?.map((opt) =>
			opt.option === option.option ? { ...opt, color: option.color } : opt,
		),
	});
}
