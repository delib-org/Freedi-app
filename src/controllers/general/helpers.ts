import { logOut } from '../db/auth';
import { HistoryTracker } from '@/redux/history/HistorySlice';
import { store } from '@/redux/store';
import { setUser } from '@/redux/users/userSlice';
import { Screen } from '@/types/TypeEnums';
import { Statement } from '@/types/statement/StatementTypes';
import { StatementSubscription } from '@/types/statement/StatementSubscription';
import { User } from '@/types/user/User';
import { Role } from '@/types/user/UserSettings';

export function updateArray<T>(
	currentArray: Array<T>,
	newItem: T,
	updateByProperty: keyof T & string
): Array<T> {
	try {
		// Check if property exists
		if (!newItem[updateByProperty]) {
			throw new Error(`Item doesn't have property ${updateByProperty}`);
		}

		// Find the index without creating a copy first (more efficient)
		const index = currentArray.findIndex(
			(item) => item[updateByProperty] === newItem[updateByProperty]
		);
		
		// If item doesn't exist, add it to the end
		if (index === -1) {
			// Only create a new array when we actually need to modify it
			return [...currentArray, newItem];
		}
		
		// For updates, do a shallow comparison of important properties instead of expensive JSON.stringify
		// This is much faster and prevents unnecessary re-renders
		const oldItem = currentArray[index];
		
		// Compare only relevant properties that might have changed
		// Test if they're different objects first
		if (oldItem === newItem) {
			return currentArray; // No change needed
		}
		
		// Check for meaningful changes by comparing most likely changed properties
		// This avoids creating a new array reference when not needed
		const hasChanges = Object.keys(newItem).some(key => {
			// Skip comparing functions and undefined values
			if (typeof newItem[key as keyof T] === 'function') return false;
			if (newItem[key as keyof T] === undefined) return false;
			
			// Compare property values
			return oldItem[key as keyof T] !== newItem[key as keyof T];
		});
		
		if (!hasChanges) {
			return currentArray; // No meaningful changes, return original array
		}
		
		// Create a new array with the updated item
		const result = [...currentArray];
		result[index] = { ...oldItem, ...newItem };
		return result;
	} catch (error) {
		console.error(error);
		return currentArray;
	}
}

export function isAuthorized(
	statement: Statement | undefined,
	statementSubscription: StatementSubscription | undefined,
	parentStatementCreatorId?: string | undefined,
	authorizedRoles?: Array<Role>
) {
	try {
		if (!statement) throw new Error('No statement');

		const user = store.getState().user.user;
		if (!user?.uid) throw new Error('No user');

		if (statement.creatorId === user.uid) return true;

		if (parentStatementCreatorId === user.uid) return true;

		if (!statementSubscription) return false;

		const role = statementSubscription?.role;

		if (role === Role.admin) {
			return true;
		}

		if (authorizedRoles?.includes(role)) return true;

		return false;
	} catch (error) {
		console.error(error);

		return false;
	}
}

export function isAdmin(role: Role | undefined): boolean {
	if (role === Role.admin || role === Role.creator) return true;

	return false;
}

export function getInitials(fullName: string) {
	// Split the full name into words
	const words = fullName.split(' ');

	// Initialize an empty string to store the initials
	let initials = '';

	// Iterate through each word and append the first letter to the initials string
	for (const word of words) {
		if (word.length > 0) {
			initials += word[0].toUpperCase();
		}
	}

	return initials;
}

export function generateRandomLightColor(uuid: string) {
	// Generate a random number based on the UUID
	const seed = parseInt(uuid.replace(/[^\d]/g, ''), 10);
	const randomValue = (seed * 9301 + 49297) % 233280;

	// Convert the random number to a hexadecimal color code
	const hexColor = `#${((randomValue & 0x00ffffff) | 0xc0c0c0)
		.toString(16)
		.toUpperCase()}`;

	return hexColor;
}

export const statementTitleToDisplay = (
	statement: string,
	titleLength: number
) => {
	const _title =
		statement.split('\n')[0].replace('*', '') || statement.replace('*', '');

	const titleToSet =
		_title.length > titleLength - 3
			? _title.substring(0, titleLength) + '...'
			: _title;

	return { shortVersion: titleToSet, fullVersion: _title };
};

//function which check if the statement can be linked to children

export function getPastelColor() {
	return `hsl(${360 * Math.random()},100%,75%)`;
}

export function calculateFontSize(text: string, maxSize = 6, minSize = 14) {
	// Set the base font size and a multiplier for adjusting based on text length
	const baseFontSize = minSize;
	const fontSizeMultiplier = 0.2;

	// Calculate the font size based on the length of the text
	const fontSize = Math.max(
		baseFontSize - fontSizeMultiplier * text.length,
		maxSize
	);

	return `${fontSize}px`;
}

export function handleLogout() {
	logOut();
	store.dispatch(setUser(null));
}

export function getTitle(statement: Statement | undefined) {
	try {
		if (!statement) return '';

		const title = statement.statement.split('\n')[0].replace('*', '');

		return title;
	} catch (error) {
		console.error(error);

		return '';
	}
}

export function getDescription(statement: Statement) {
	try {
		if (!statement) throw new Error('No statement');

		const description = statement.statement.split('\n').slice(1).join('\n');

		return description;
	} catch (error) {
		console.error(error);

		return '';
	}
}

export function getSetTimerId(statementId: string, order: number) {
	return `${statementId}--${order}`;
}

export function getRoomTimerId(
	statementId: string,
	roomNumber: number,
	order: number
) {
	return `${statementId}--${roomNumber}--${order}`;
}

export function getStatementSubscriptionId(
	statementId: string,
	user: User
): string | undefined {
	try {
		if (!user?.uid) throw new Error('No user');
		if (!statementId) throw new Error('No statementId');

		return `${user.uid}--${statementId}`;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export function getFirstScreen(array: Array<Screen>): Screen {
	try {
		//get the first screen from the array by this order: home, questions, options, chat, vote
		if (!array) throw new Error('No array');

		if (array.includes(Screen.HOME)) return Screen.HOME;
		if (array.includes(Screen.QUESTIONS)) return Screen.QUESTIONS;
		if (array.includes(Screen.OPTIONS)) return Screen.OPTIONS;
		if (array.includes(Screen.CHAT)) return Screen.CHAT;
		if (array.includes(Screen.VOTE)) return Screen.VOTE;

		return Screen.CHAT;
	} catch (error) {
		console.error(error);

		return Screen.CHAT;
	}
}

//get first name from full name or first name with firs family name letter

export function getFirstName(fullName: string) {
	try {
		if (!fullName) return '';
		const names = fullName.split(' ');
		if (names.length > 1) return names[0] + ' ' + names[1][0] + '.';

		return names[0];
	} catch (error) {
		console.error(error);

		return '';
	}
}

export function getNumberDigits(number: number): number {
	const _number = Math.floor(number);

	return _number.toString().length;
}

export function isProduction(): boolean {
	return window.location.hostname !== 'localhost';
}

export const handleCloseInviteModal = (
	setShowModal: (show: boolean) => void
) => {
	const inviteModal = document.querySelector(
		'.inviteModal'
	) as HTMLDivElement;
	inviteModal.classList.add('closing');

	setTimeout(() => {
		setShowModal(false);
	}, 400);
};

export function getLastElements(
	array: Array<unknown>,
	number: number
): Array<unknown> {
	return array.slice(Math.max(array.length - number, 1));
}

export function getTime(time: number): string {
	const timeEvent = new Date(time);
	const hours = timeEvent.getHours();
	const minutes = timeEvent.getMinutes();

	const timeDay = timeEvent.getDate();
	const timeMonth = timeEvent.getMonth() + 1;
	const timeYear = timeEvent.getFullYear();

	const currentTime = new Date();
	const currentDay = currentTime.getDate();
	const currentMonth = currentTime.getMonth() + 1;
	const currentYear = currentTime.getFullYear();

	if (currentYear !== timeYear) {
		return `${timeDay}/${timeMonth}/${timeYear} ${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
	} else if (
		currentDay !== timeDay &&
		currentMonth === timeMonth &&
		currentYear === timeYear
	) {
		return `${timeDay}/${timeMonth} ${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
	} else if (
		currentDay === timeDay &&
		currentMonth === timeMonth &&
		currentYear === timeYear
	) {
		return `${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
	}

	return `${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
}

export function truncateString(text: string, maxLength = 20): string {
	return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export function processHistory(
	{ statementId, pathname }: HistoryTracker,
	state: HistoryTracker[]
): HistoryTracker[] {
	try {
		const newHistory = [...state];

		//add statement id to history only if it is not already there
		if (newHistory.length === 0) return [{ statementId, pathname }];
		if (pathname === state[state.length - 1]?.pathname) return newHistory;

		//in case the the user only navigate between the screens of the statement, just update the pathname
		if (!statementId) return [...state, { pathname }];
		if (newHistory[newHistory.length - 1].statementId === statementId) {
			newHistory[newHistory.length - 1].pathname = pathname;

			return newHistory;
		} else {
			return [...state, { statementId, pathname }];
		}
	} catch (error) {
		console.error(error);

		return state;
	}
}

export function getLatestUpdateStatements(statements: Statement[]): number {
	if (!statements || statements.length === 0) {
		return 0;
	}

	return statements.reduce(
		(latestUpdate, statement) =>
			statement.lastUpdate > latestUpdate ? statement.lastUpdate : latestUpdate,
		0
	);
}