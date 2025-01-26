import { User, UserSchema } from '../user';
import * as v from 'valibot';
export function parseUserFromFirebase(user: any | undefined): User | undefined {
	try {
		if (!user) throw new Error('user is missing');

		let { displayName, email, photoURL, uid, isAnonymous } = user;
		if (isAnonymous) displayName = 'Anonymous';

		v.parse(UserSchema, { displayName, email, photoURL, uid, isAnonymous });
		return { displayName, email, photoURL, uid, isAnonymous };
	} catch (error) {
		console.error(error);
		return undefined;
	}
}

export function updateArray<T>(
	currentArray: Array<T>,
	newItem: T,
	updateByProperty: keyof T & string
): Array<T> {
	try {
		const arrayTemp = [...currentArray];

		if (!newItem[updateByProperty]) {
			throw new Error(`Item doesn't have property ${updateByProperty}`);
		}

		const index = arrayTemp.findIndex(
			(item) => item[updateByProperty] === newItem[updateByProperty]
		);
		if (index === -1) arrayTemp.push(newItem);
		else {
			const oldItem = JSON.stringify(arrayTemp[index]);
			const newItemString = JSON.stringify({
				...arrayTemp[index],
				...newItem,
			});
			if (oldItem !== newItemString)
				arrayTemp[index] = { ...arrayTemp[index], ...newItem };
		}

		return arrayTemp;
	} catch (error) {
		console.error(error);

		return currentArray;
	}
}
