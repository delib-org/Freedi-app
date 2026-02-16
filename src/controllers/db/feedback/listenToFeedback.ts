import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Collections, Feedback } from '@freedi/shared-types';
import { DB } from '../config';
import { convertTimestampsToMillis } from '@/helpers/timestampHelpers';

export function listenToFeedback(
	statementId: string,
	callback: (feedback: Feedback[]) => void,
): () => void {
	try {
		if (!statementId) {
			console.error('No statementId provided to listenToFeedback');

			return () => {};
		}

		// Start with a simpler query to avoid index issues
		// We'll sort client-side instead
		const feedbackQuery = query(
			collection(DB, Collections.feedback),
			where('statementId', '==', statementId),
		);

		const unsubscribe = onSnapshot(
			feedbackQuery,
			(snapshot) => {
				try {
					const feedbackList: Feedback[] = [];
					snapshot.forEach((doc) => {
						const data = convertTimestampsToMillis(doc.data()) as Feedback;
						// Only add if data has required fields
						if (data && data.feedbackText) {
							feedbackList.push({
								...data,
								// Ensure creator exists with required fields
								creator: data.creator || {
									uid: 'unknown',
									displayName: 'Unknown User',
								},
							});
						}
					});

					// Sort client-side by createdAt (newest first)
					feedbackList.sort((a, b) => {
						const aTime = a.createdAt || 0;
						const bTime = b.createdAt || 0;

						return bTime - aTime;
					});

					callback(feedbackList);
				} catch (error) {
					console.error('Error processing feedback snapshot:', error);
					callback([]);
				}
			},
			(error) => {
				console.error('Error in feedback listener:', error);
				// If it's an index error, provide helpful message
				if (error.message?.includes('index')) {
					console.info('Consider adding a composite index for better performance');
				}
				callback([]);
			},
		);

		return unsubscribe;
	} catch (error) {
		console.error('Error setting up feedback listener:', error);
		callback([]);

		return () => {};
	}
}
