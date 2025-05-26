import { Collections, Statement, UserQuestion, UserQuestionSchema } from "delib-npm";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { DB } from "../config";
import { parse } from "valibot";
import { store } from "@/redux/store";
import { deleteUserQuestion, setUserQuestion } from "@/redux/userData/userDataSlice";

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