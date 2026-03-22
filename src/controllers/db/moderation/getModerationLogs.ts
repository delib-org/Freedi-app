import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { DB } from '../config';
import { Collections, ModerationLog } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

const MODERATION_QUERY_LIMIT = 50;

/**
 * Fetches moderation logs for a specific statement (by topParentId).
 * Returns the most recent rejections first.
 */
export async function getModerationLogs(topParentId: string): Promise<ModerationLog[]> {
	try {
		const moderationRef = collection(DB, Collections.moderationLogs);
		const q = query(
			moderationRef,
			where('topParentId', '==', topParentId),
			orderBy('createdAt', 'desc'),
			limit(MODERATION_QUERY_LIMIT),
		);

		const snapshot = await getDocs(q);
		const logs: ModerationLog[] = [];

		snapshot.forEach((doc) => {
			logs.push(doc.data() as ModerationLog);
		});

		return logs;
	} catch (error) {
		logError(error, {
			operation: 'moderation.getModerationLogs',
			metadata: { topParentId },
		});

		return [];
	}
}
