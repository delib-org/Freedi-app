import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Collections, Feedback } from 'delib-npm';
import { DB } from '../config';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';

export function listenToFeedback(
	statementId: string,
	callback: (feedback: Feedback[]) => void
): () => void {
	try {
		if (!statementId) {
			console.error('No statementId provided to listenToFeedback');

			return () => {};
		}

		const feedbackQuery = query(
			collection(DB, Collections.feedback),
			where('statementId', '==', statementId),
			orderBy('createdAt', 'desc')
		);

		const unsubscribe = onSnapshot(
			feedbackQuery,
			(snapshot) => {
				try {
					const feedbackList: Feedback[] = [];
					snapshot.forEach((doc) => {
						const data = convertTimestampsToMillis(doc.data()) as Feedback;
						feedbackList.push(data);
					});
					callback(feedbackList);
				} catch (error) {
					console.error('Error processing feedback snapshot:', error);
					callback([]);
				}
			},
			(error) => {
				console.error('Error in feedback listener:', error);
				callback([]);
			}
		);

		return unsubscribe;
	} catch (error) {
		console.error('Error setting up feedback listener:', error);
		callback([]);

		return () => {};
	}
}