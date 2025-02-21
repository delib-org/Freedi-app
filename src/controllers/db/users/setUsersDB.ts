import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { Collections } from '@/types/TypeEnums';
import { UserSchema, User } from '@/types/user/User';
import { parse } from 'valibot';
import { Agreement, AgreementSchema } from '@/types/agreement/Agreement';

export async function setUserToDB(user: User) {
	try {
		if (!user) throw new Error('user is undefined');

		const parsedUser = parse(UserSchema, user);

		const userRef = doc(FireStore, Collections.users, parsedUser.uid);
		await setDoc(userRef, parsedUser, { merge: true });
		const userFromDB = await getDoc(userRef);

		return userFromDB.data();
	} catch (error) {
		console.error(error);
	}
}

export async function updateUserFontSize(size: number) {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('user is not logged in');
		if (typeof size !== 'number') throw new Error('size must be a number');
		if (!user.uid) throw new Error('uid is required');
		if (size < 0) throw new Error('size must be positive');

		const userRef = doc(FireStore, Collections.users, user.uid);
		await setDoc(userRef, { fontSize: size }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}

export async function updateUserAgreement(
	agreement: Agreement
): Promise<boolean> {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('user is not logged in');
		if (!user.uid) throw new Error('uid is required');
		if (!agreement) throw new Error('agreement is required');

		const parsedAgreement = parse(AgreementSchema, agreement);

		const userRef = doc(FireStore, Collections.users, user.uid);
		await setDoc(userRef, { agreement: parsedAgreement }, { merge: true });

		return true;
	} catch (error) {
		console.error(error);

		return false;
	}
}
