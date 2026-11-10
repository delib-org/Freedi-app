import { query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { Collections, Online, OnlineSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import { PRESENCE } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { createCollectionRef } from '@/utils/firebaseUtils';

//listen to online users
export function ListenToOnlineUsers(
	statementId: string,
	setOnlineUsers: (users: Online[]) => void,
	setIsLoading?: (loading: boolean) => void,
): () => void {
	if (!statementId) return () => {};

	const q = query(
		createCollectionRef(Collections.online),
		where('statementId', '==', statementId),
		orderBy('lastUpdated', 'desc'),
		limit(PRESENCE.MAX_LISTENED_PEOPLE),
	);

	const unsubscribe = onSnapshot(
		q,
		(snapshot) => {
			const users: Online[] = [];

			snapshot.forEach((doc) => {
				try {
					const data = doc.data();
					if (data.lastUpdated?.toMillis) {
						data.lastUpdated = data.lastUpdated.toMillis();
					}
					const validated = parse(OnlineSchema, data);
					users.push(validated);
				} catch (err) {
					logError(err, {
						operation: 'online.getOnline.unsubscribe',
						metadata: { message: 'Error validating online user data:' },
					});
				}
			});

			const now = Date.now();
			const validUsers = users.filter(
				(u) => typeof u.lastUpdated === 'number' && now - u.lastUpdated < PRESENCE.STALE_AFTER_MS,
			);

			setOnlineUsers(validUsers);
			if (setIsLoading) setIsLoading(false);
		},
		(error) => {
			logError(error, { operation: 'online.getOnline.listen', statementId });
			if (setIsLoading) setIsLoading(false);
		},
	);

	return unsubscribe;
}
