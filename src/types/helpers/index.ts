import { Role } from '../user';

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

export function isMember(role: Role | undefined): boolean {
	if (role === Role.admin || role === Role.member || role === Role.creator)
		return true;
	return false;
}

export function maxKeyInObject(obj: { [key: string]: number }): string {
	let maxKey = Object.keys(obj)[0];
	let maxValue = obj[maxKey];

	for (const key in obj) {
		if (obj[key] > maxValue) {
			maxValue = obj[key];
			maxKey = key;
		}
	}

	return maxKey;
}

export function getRandomUID(numberOfChars = 12): string {
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-0123456789';
	let randomString = '';
	for (let i = 0; i < numberOfChars; i++) {
		randomString += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return randomString;
}
