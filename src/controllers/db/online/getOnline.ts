import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, Online, OnlineSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';

//listen to online users
export function ListenToOnlineUsers(
	statementId: string,
	setOnlineUsers: (users: Online[]) => void,
	setIsLoading?: (loading: boolean) => void,
): () => void {
	if (!statementId) return () => {};

	const q = query(
		collection(FireStore, Collections.online),
		where('statementId', '==', statementId),
	);

	const unsubscribe = onSnapshot(q, (snapshot) => {
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
			(u) => typeof u.lastUpdated === 'number' && now - u.lastUpdated < 60000,
		);

		setOnlineUsers(validUsers);
		if (setIsLoading) setIsLoading(false);
	});

	return unsubscribe;
}
