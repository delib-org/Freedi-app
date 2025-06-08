import { Collections, DemographicOption, DemographicOptionSchema, Statement, UserQuestion, UserQuestionSchema } from "delib-npm";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { DB } from "../config";
import { parse, safeParse } from "valibot";
import { store } from "@/redux/store";
import { deleteUserQuestion, setUserQuestion } from "@/redux/userData/userDataSlice";
import type { BaseSchema } from "valibot";

export async function setUserDataQuestion(statement: Statement, question: UserQuestion) {
	try {
		if (!statement || !question) {
			throw new Error("Statement and question must be provided");
		}
		parse(UserQuestionSchema, question);
		const dispatch = store.dispatch;

		const questionsRef = doc(DB, Collections.userDataQuestions, question.userQuestionId);

		await setDoc(questionsRef, question, {
			merge: true
		});

		dispatch(setUserQuestion(question));

	} catch (error) {
		console.error("Error adding user data question:", error);

	}
}

export async function deleteUserDataQuestion(question: UserQuestion) {
	try {
		if (!question || !question.userQuestionId) {
			throw new Error("Question and question ID must be provided");
		}

		const questionsRef = doc(DB, Collections.userDataQuestions, question.userQuestionId);

		await deleteDoc(questionsRef);

		store.dispatch(deleteUserQuestion(question.userQuestionId));

	} catch (error) {
		console.error("Error deleting user data question:", error);
	}
}

export async function setUserDataOption(question: UserQuestion, option: DemographicOption) {
	try {
		if (!question || !question.userQuestionId || !option) {
			throw new Error("Question ID and option must be provided");
		}

		const results = safeParse(UserQuestionSchema, question);
		if (!results.success) {
			console.error("Invalid question data:", results.issues);
			throw new Error("Invalid question data");
		}

		const resultsOption = safeParse(DemographicOptionSchema, option);
		if (!resultsOption.success) {
			console.error("Invalid option data:", resultsOption.issues);
			throw new Error("Invalid option data");
		}

		const questionsRef = doc(DB, Collections.userDataQuestions, question.userQuestionId);

		const questionDB = await getDoc(questionsRef);
		if (!questionDB.exists()) throw new Error("Question does not exist in the database");
		const questionData = questionDB.data() as UserQuestion;

		if (!questionData.options) {
			await updateDoc(questionsRef, {
				options: [option]
			});

			return;
		}
		if (questionData.options.find(opt => opt.option === option.option)) {
			return;
		}
		await updateDoc(questionsRef, {
			options: [...questionData.options, option]
		});

		return;
	} catch (error) {
		console.error("Error adding user data option:", error);
	}
}

export async function deleteUserDataOption(question: UserQuestion, option: string) {
	try {
		if (!question || !question.userQuestionId || !option) {
			throw new Error("Question ID and option must be provided");
		}

		const questionsRef = doc(DB, Collections.userDataQuestions, question.userQuestionId);

		const questionDB = await getDoc(questionsRef);
		if (!questionDB.exists()) throw new Error("Question does not exist in the database");
		const questionData = questionDB.data() as UserQuestion;
		if (!questionData.options || !questionData.options.find(opt => opt.option === option)) {
			return;
		}
		await updateDoc(questionsRef, {
			options: questionData.options.filter(opt => opt.option !== option)
		});

		return;
	} catch (error) {
		console.error("Error deleting user data option:", error);
	}
}

export async function setUserAnswers(answers: UserQuestion[]) {
	try {
		if (!answers || !Array.isArray(answers)) {
			throw new Error("Answers must be an array");
		}

		const dispatch = store.dispatch;
		const user = store.getState().creator?.creator;
		if (!user || !user.uid) {
			throw new Error("User must be logged in to set answers");
		}
		const { uid } = user;
		const batch = writeBatch(DB);

		for (const answer of answers) {
			answer.userId = uid; // Ensure userId is set
			const { isValid } = validateDataAndLogIssues(UserQuestionSchema, answer);
			if (!isValid) throw new Error("Invalid answer data");

			const questionRef = doc(DB, Collections.usersData, `${answer.userQuestionId}--${uid}`);
			batch.set(questionRef, answer, { merge: true });
			dispatch(setUserQuestion(answer));
		}

		await batch.commit();

	} catch (error) {
		console.error("Error setting user answers:", error);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateDataAndLogIssues<T>(schema: BaseSchema<any, T, any>, data: unknown): { isValid: boolean; validData?: T } {
	const result = safeParse(schema, data);

	if (!result.success) {
		console.info('Validation failed!');
		console.info('Issues:', result.issues);

		// Print each issue in detail
		result.issues.forEach((issue, index) => {
			console.info(`Issue ${index + 1}:`);
			console.info('  Path:', issue.path?.map(p => p.key).join('.') || 'root');
			console.info('  Message:', issue.message);
			console.info('  Expected:', issue.expected);
			console.info('  Received:', issue.received);
			console.info('  Input:', issue.input);
		});

		return { isValid: false };
	}

	return { isValid: true, validData: result.output };
}

export function setDemographicOptionColor(userQuestion: UserQuestion, option: DemographicOption) {
	if (!userQuestion || !userQuestion.userQuestionId || !option) {
		throw new Error("User question ID and option must be provided");
	}

	const results = safeParse(UserQuestionSchema, userQuestion);
	if (!results.success) {
		console.error("Invalid user question data:", results.issues);
		throw new Error("Invalid user question data");
	}

	const questionsRef = doc(DB, Collections.userDataQuestions, userQuestion.userQuestionId);

	updateDoc(questionsRef, {
		options: userQuestion.options?.map(opt => opt.option === option.option ? { ...opt, color: option.color } : opt)
	});
}