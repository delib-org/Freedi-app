import { doc, setDoc } from 'firebase/firestore';
import { Collections, Feedback } from '@freedi/shared-types';
import { DB } from '../config';

export async function setFeedbackToDB(feedback: Feedback): Promise<void> {
	try {
		if (!feedback.feedbackId) {
			throw new Error('Feedback ID is required');
		}

		if (!feedback.statementId) {
			throw new Error('Statement ID is required');
		}

		if (!feedback.feedbackText || feedback.feedbackText.trim().length === 0) {
			throw new Error('Feedback text is required');
		}

		const feedbackRef = doc(DB, Collections.feedback, feedback.feedbackId);
		await setDoc(feedbackRef, feedback);

		console.info('Feedback saved successfully:', feedback.feedbackId);
	} catch (error) {
		console.error('Error saving feedback to database:', error);
		throw error;
	}
}
