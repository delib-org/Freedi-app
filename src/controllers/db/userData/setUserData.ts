import { Collections, Statement, UserQuestion, UserQuestionSchema } from "delib-npm";
import { addDoc, collection } from "firebase/firestore";
import { DB } from "../config";
import { parse } from "valibot";

export async function addUserDataQuestion(statement: Statement, question: UserQuestion) {
	try {
		if (!statement || !question) {
			throw new Error("Statement and question must be provided");
		}
		parse(UserQuestionSchema, question);
		const questionsRef = collection(DB, Collections.userDataQuestions);
		console.log(questionsRef, question)
		const newQuestion = await addDoc(questionsRef, question);

		console.log("User data question added with ID:", newQuestion.id);
	} catch (error) {
		console.error("Error adding user data question:", error);
		throw new Error("Failed to add user data question");

	}
}