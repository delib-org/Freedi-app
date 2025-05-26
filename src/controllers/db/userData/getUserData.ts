import { collection, query, where, getDocs } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, UserQuestion, UserQuestionSchema } from 'delib-npm';
import { parse } from 'valibot';
import { store } from '@/redux/store';
import { setUserQuestions } from '@/redux/userData/userDataSlice';

/**
 * Fetches user questions from the database for a specific statement ID
 * and dispatches them to the Redux store
 * @param statementId - The ID of the statement to fetch questions for
 */
export async function getUserQuestions(statementId: string): Promise<void> {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to get user questions');
		}

		const dispatch = store.dispatch;

		// Create a reference to the userDataQuestions collection
		const userQuestionsRef = collection(FireStore, Collections.userDataQuestions);

		// Create a query to filter by statementId
		const q = query(
			userQuestionsRef,
			where('statementId', '==', statementId)
		);

		// Execute the query
		const querySnapshot = await getDocs(q);

		// Map the documents to UserQuestion objects with validatio

		const userQuestions: UserQuestion[] = querySnapshot.docs
			.map((doc) => {
				try {
					const data = doc.data();
					// Validate the data against the UserQuestion schema

					return parse(UserQuestionSchema, data);
				} catch (validationError) {
					console.error(`Invalid user question data for document ${doc.id}:`, validationError);

					return null;
				}
			})
			.filter((question): question is UserQuestion => question !== null);

		// Dispatch the questions to Redux store
		dispatch(setUserQuestions(userQuestions));

	} catch (error) {
		console.error('Error fetching user questions:', error);
		// Dispatch empty array in case of error to clear any stale data
		store.dispatch(setUserQuestions([]));
	}
}