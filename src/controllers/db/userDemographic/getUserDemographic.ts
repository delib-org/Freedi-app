import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, UserDemographicQuestion, UserDemographicQuestionSchema, User } from 'delib-npm';
import { parse } from 'valibot';
import { store } from '@/redux/store';
import { deleteUserDemographic, deleteUserDemographicQuestion, setUserDemographic, setUserDemographicQuestion, setUserDemographicQuestions } from '@/redux/userDemographic/userDemographicSlice';
import { MemberReviewData } from '@/view/pages/statement/components/settings/components/memberValidation/MemberValidation';
import { getAllMemberValidationStatuses } from '../memberValidation/memberValidationStatus';

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

		console.info(`Found ${querySnapshot.size} user demographic questions for statement ${statementId}`);

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

		console.info('Dispatching user demographic questions:', userQuestions);

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

		console.info(`Setting up listener for user demographic questions for statement: ${statementId}`);

		const userQuestionsRef = collection(FireStore, Collections.userDemographicQuestions);
		const q = query(
			userQuestionsRef,
			where('statementId', '==', statementId)
		);

		return onSnapshot(q, (userQuestionsDB) => {
			console.info(`User demographic questions listener fired, ${userQuestionsDB.size} documents found`);

			userQuestionsDB.docChanges().forEach((change) => {
				try {
					const data = change.doc.data();
					const validatedQuestion = parse(UserDemographicQuestionSchema, data);

					console.info(`Processing user demographic question change: ${change.type}`, validatedQuestion);

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

		console.info(`Setting up listener for user demographic answers for statement: ${statementId}, user: ${uid}`);

		const userAnswersRef = collection(FireStore, Collections.usersData);
		const q = query(
			userAnswersRef,
			where('statementId', '==', statementId),
			where('userId', '==', uid)
		);

		return onSnapshot(q, (userAnswersDB) => {

			console.info(`User demographic answers listener fired, ${userAnswersDB.size} documents found for user ${uid}`);

			userAnswersDB.docChanges().forEach((change) => {
				try {
					const data = change.doc.data() as UserDemographicQuestion;
					const validatedAnswer = parse(UserDemographicQuestionSchema, data);

					console.info(`Processing user demographic answer change: ${change.type}`, validatedAnswer);

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

/**
 * Fetches all user demographic responses for admin review
 * This function is used by admins to review and validate member responses
 * @param statementId - The ID of the statement to fetch responses for
 * @returns Promise<MemberReviewData[]> - Array of member review data
 */
export async function getUserDemographicResponses(statementId: string): Promise<MemberReviewData[]> {
	try {
		if (!statementId) {
			throw new Error('Statement ID is required to get user demographic responses');
		}

		// Get all questions for this statement
		const questionsRef = collection(FireStore, Collections.userDemographicQuestions);
		const questionsQuery = query(questionsRef, where('statementId', '==', statementId));
		const questionsSnapshot = await getDocs(questionsQuery);

		const questions: UserDemographicQuestion[] = [];
		questionsSnapshot.forEach((doc) => {
			try {
				const data = doc.data();
				const validatedQuestion = parse(UserDemographicQuestionSchema, data);
				questions.push(validatedQuestion);
			} catch (error) {
				console.error('Error validating question:', error);
			}
		});

		// Get all user responses for this statement
		const responsesRef = collection(FireStore, Collections.usersData);
		const responsesQuery = query(responsesRef, where('statementId', '==', statementId));
		const responsesSnapshot = await getDocs(responsesQuery);

		// Get all validation statuses for this statement
		const validationStatuses = await getAllMemberValidationStatuses(statementId);

		// Group responses by user
		const userResponsesMap = new Map<string, MemberReviewData>();

		responsesSnapshot.forEach((doc) => {
			const responseData = doc.data();
            const response = responseData as UserDemographicQuestion;

			if (!userResponsesMap.has(response.userId)) {
				// Get the validation status for this user, default to 'pending' if not found
				const validationStatus = validationStatuses.get(response.userId);

				// Initialize user data
				userResponsesMap.set(response.userId, {
					userId: response.userId,
					user: responseData.user || {
						uid: response.userId,
						displayName: 'Anonymous',
					} as User,
					responses: [],
					joinedAt: responseData.createdAt,
					flags: [],
					status: validationStatus?.status || 'pending'
				});
			}

			const userData = userResponsesMap.get(response.userId)!;

			// Find the matching question
			const question = questions.find(q => q.userQuestionId === response.userQuestionId);

			if (question) {
				userData.responses.push({
					questionId: response.userQuestionId,
					question: question.question,
					answer: response.answer || response.answerOptions || '',
					answeredAt: responseData.createdAt
				});
			}
		});

		// Convert map to array
		const memberReviews = Array.from(userResponsesMap.values());

		return memberReviews;
	} catch (error) {
		console.error('Error fetching user demographic responses for review:', error);
		return [];
	}
}