import { Role } from './user/UserSettings';

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
