import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, UserDemographicQuestion, UserDemographicQuestionSchema } from 'delib-npm';
import { parse } from 'valibot';
import { store } from '@/redux/store';
import { deleteUserDemographic, deleteUserDemographicQuestion, setUserDemographic, setUserDemographicQuestion, setUserDemographicQuestions } from '@/redux/userDemographic/userDemographicSlice';

/**
 * Fetches user demographic questions from the database for a specific statement ID
 * and dispatches them to the Redux store
 * @param statementId - The ID of the statement to fetch questions for
 */
export async function getUserDemographicQuestions(statementId: string): Promise<void> {

	try {
		if (!statementId) {
			throw new Error('Statement ID is required to get user demographic questions');
		}

		const dispatch = store.dispatch;

		// Create a reference to the userDataQuestions collection
		const userQuestionsRef = collection(FireStore, Collections.userDemographicQuestions);

		// Create a query to filter by statementId
		const q = query(
			userQuestionsRef,
			where('statementId', '==', statementId)
		);

		// Execute the query
		const querySnapshot = await getDocs(q);

		// Map the documents to UserDemographicQuestion objects with validation

		const userQuestions: UserDemographicQuestion[] = querySnapshot.docs
			.map((doc) => {
				try {
					const data = doc.data();
					// Validate the data against the UserDemographicQuestion schema

					return parse(UserDemographicQuestionSchema, data);
				} catch (validationError) {
					console.error(`Invalid user demographic question data for document ${doc.id}:`, validationError);

					return null;
				}
			})
			.filter((question): question is UserDemographicQuestion => question !== null);

		// Dispatch the questions to Redux store
		dispatch(setUserDemographicQuestions(userQuestions));

	} catch (error) {
		console.error('Error fetching user demographic questions:', error);
		// Dispatch empty array in case of error to clear any stale data
		store.dispatch(setUserDemographicQuestions([]));
	}
}

export function listenToUserDemographicQuestions(statementId: string): () => void {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to listen for user demographic questions');
		}

		const userQuestionsRef = collection(FireStore, Collections.userDemographicQuestions);
		const q = query(
			userQuestionsRef,
			where('statementId', '==', statementId)
		);

		return onSnapshot(q, (userQuestionsDB) => {
			userQuestionsDB.docChanges().forEach((change) => {
				try {
					const data = change.doc.data();
					const validatedQuestion = parse(UserDemographicQuestionSchema, data);

					if (change.type === 'added' || change.type === 'modified') {
						store.dispatch(setUserDemographicQuestion(validatedQuestion));
					} else if (change.type === 'removed') {
						store.dispatch(deleteUserDemographicQuestion(change.doc.id));
					}
				} catch (validationError) {
					console.error(`Invalid user question data for document ${change.doc.id}:`, validationError);
				}
			});
		});

	} catch (error) {
		console.error('Error setting up listener for user demographic questions:', error);

		return () => { return; } // Return a no-op function in case of error
	}
}

export function listenToUserDemographicAnswers(statementId: string) {

	try {
		const user = store.getState().creator.creator;
		if (!user || !user.uid) {
			throw new Error('User must be logged in to listen for user demographic answers');
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
					const data = change.doc.data() as UserDemographicQuestion;
					const validatedAnswer = parse(UserDemographicQuestionSchema, data);

					if (change.type === 'added' || change.type === 'modified') {
						store.dispatch(setUserDemographic(validatedAnswer));
					} else if (change.type === 'removed') {
						store.dispatch(deleteUserDemographic(data.userQuestionId));
					}
				} catch (validationError) {
					console.error(`Invalid user demographic answer data for document ${change.doc.id}:`, validationError);
				}
			});
		});
	} catch (error) {
		console.error('Error setting up listener for user demographic answers:', error);

		return () => { return; } // Return a no-op function in case of error

	}
}