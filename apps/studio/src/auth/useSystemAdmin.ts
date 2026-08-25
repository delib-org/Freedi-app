import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Collections, type User } from '@freedi/shared-types';
import { db } from '@/firebase';
import { logError } from '@/utils/logError';

/**
 * Live `systemAdmin === true` flag from the caller's `usersV2/{uid}` document.
 * System admins see every organization and can create new ones.
 */
export function useSystemAdmin(uid: string | null | undefined): boolean {
	const [isSystemAdmin, setIsSystemAdmin] = useState(false);

	useEffect(() => {
		if (!uid) {
			setIsSystemAdmin(false);

			return;
		}

		const unsubscribe = onSnapshot(
			doc(db, Collections.users, uid),
			(snap) => {
				const data = snap.exists() ? (snap.data() as Partial<User>) : undefined;
				setIsSystemAdmin(data?.systemAdmin === true);
			},
			(error) => {
				logError(error, { operation: 'auth.useSystemAdmin', userId: uid });
				setIsSystemAdmin(false);
			},
		);

		return () => unsubscribe();
	}, [uid]);

	return isSystemAdmin;
}
