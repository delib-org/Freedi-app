import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, UserQuestion, UserQuestionSchema } from 'delib-npm';
import { parse } from 'valibot';
import { store } from '@/redux/store';
import { deleteUserData, deleteUserQuestion, setUserData, setUserQuestion, setUserQuestions } from '@/redux/userData/userDataSlice';

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

		// Map the documents to UserQuestion objects with validation

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

export function listenToUserQuestions(statementId: string): () => void {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to listen for user questions');
		}

		const userQuestionsRef = collection(FireStore, Collections.userDataQuestions);
		const q = query(
			userQuestionsRef,
			where('statementId', '==', statementId)
		);

		return onSnapshot(q, (userQuestionsDB) => {
			userQuestionsDB.docChanges().forEach((change) => {
				try {
					const data = change.doc.data();
					const validatedQuestion = parse(UserQuestionSchema, data);

					if (change.type === 'added' || change.type === 'modified') {
						store.dispatch(setUserQuestion(validatedQuestion));
					} else if (change.type === 'removed') {
						store.dispatch(deleteUserQuestion(change.doc.id));
					}
				} catch (validationError) {
					console.error(`Invalid user question data for document ${change.doc.id}:`, validationError);
				}
			});
		});

	} catch (error) {
		console.error('Error setting up listener for user questions:', error);

		return () => { return; } // Return a no-op function in case of error
	}
}

export function listenToUserAnswers(statementId: string) {

	try {
		const user = store.getState().creator.creator;
		if (!user || !user.uid) {
			throw new Error('User must be logged in to listen for user answers');
		}
		const uid = user.uid;

		const userAnswersRef = collection(FireStore, Collections.usersData);
		const q = query(
			userAnswersRef,
			where('statementId', '==', statementId),
			where('userId', '==', uid)
		);

		return onSnapshot(q, (userAnswersDB) => {

			userAnswersDB.docChanges().forEach((change) => {
				try {
					const data = change.doc.data() as UserQuestion;
					const validatedAnswer = parse(UserQuestionSchema, data);

					if (change.type === 'added' || change.type === 'modified') {
						store.dispatch(setUserData(validatedAnswer));
					} else if (change.type === 'removed') {
						store.dispatch(deleteUserData(data.userQuestionId));
					}
				} catch (validationError) {
					console.error(`Invalid user answer data for document ${change.doc.id}:`, validationError);
				}
			});
		});
	} catch (error) {
		console.error('Error setting up listener for user answers:', error);

		return () => { return; } // Return a no-op function in case of error

	}
}