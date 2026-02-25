import {
	StatementSubscription,
	Statement,
	Role,
	StatementType,
	QuestionType,
} from '@freedi/shared-types';
import { useAuthentication } from '../hooks/useAuthentication';
import { EnhancedEvaluationThumb } from '@/types/evaluation';
import { logError } from '@/utils/errorHandling';

// Re-export APIEndPoint from separate file to avoid circular dependencies
export { APIEndPoint } from './apiEndpoint';

export function isAuthorized(
	statement: Statement | undefined,
	statementSubscription: StatementSubscription | undefined,
	parentStatementCreatorId?: string | undefined,
	authorizedRoles?: Array<Role>,
) {
	try {
		if (!statement) throw new Error('No statement');

		const { user } = useAuthentication();
		if (!user) return false;

		if (isUserCreator(user.uid, statement, parentStatementCreatorId, statementSubscription)) {
			return true;
		}

		if (
			statementSubscription &&
			isUserAuthorizedByRole(statementSubscription.role, authorizedRoles)
		) {
			return true;
		}

		return false;
	} catch (error) {
		logError(error, { operation: 'general.helpers.isAuthorized' });

		return false;
	}
}

function isUserCreator(
	userId: string,
	statement: Statement,
	parentStatementCreatorId?: string,
	statementSubscription?: StatementSubscription,
): boolean {
	return (
		statement.creator?.uid === userId ||
		statement.creator?.uid === parentStatementCreatorId ||
		statement.creator?.uid === statementSubscription?.userId
	);
}
export function isChatMessage(statementType: StatementType): boolean {
	if (statementType === StatementType.statement) return true;

	return false;
}
export function isMassConsensus(questionType: QuestionType): boolean {
	if (questionType === QuestionType.massConsensus) return true;

	return false;
}
function isUserAuthorizedByRole(role: Role, authorizedRoles?: Array<Role>): boolean {
	return role === Role.admin || (authorizedRoles?.includes(role) ?? false);
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
export const getRandomColor = () => {
	const letters = '0123456789ABCDEF';
	let color = '#';
	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}

	return color;
};

export function generateRandomLightColor(uuid: string) {
	// Generate a random number based on the UUID
	const seed = parseInt(uuid.replace(/[^\d]/g, ''), 10);
	const randomValue = (seed * 9301 + 49297) % 233280;

	// Convert the random number to a hexadecimal color code
	const hexColor = `#${((randomValue & 0x00ffffff) | 0xc0c0c0).toString(16).toUpperCase()}`;

	return hexColor;
}
// Type restriction configuration for statement hierarchy
export const TYPE_RESTRICTIONS: Record<
	StatementType,
	{
		disallowedChildren?: StatementType[];
		reason?: string;
	}
> = {
	[StatementType.option]: {
		disallowedChildren: [StatementType.option],
		reason: 'Options cannot contain other options',
	},
	[StatementType.group]: {
		disallowedChildren: [StatementType.option],
		reason: 'Groups cannot contain options',
	},
	[StatementType.statement]: {},
	[StatementType.question]: {},
	[StatementType.document]: {},
	[StatementType.comment]: {},
	[StatementType.paragraph]: {},
};

export function isStatementTypeAllowedAsChildren(
	parentStatement: string | { statementType: StatementType },
	childType: StatementType,
): boolean {
	// Handle null/undefined gracefully
	if (!parentStatement) {
		return true;
	}

	// Handle 'top' case and string case
	if (parentStatement === 'top' || typeof parentStatement === 'string') {
		return true;
	}

	const parentType = parentStatement.statementType;
	const restrictions = TYPE_RESTRICTIONS[parentType];

	if (restrictions?.disallowedChildren?.includes(childType)) {
		// Log the restriction for debugging
		console.info(
			`Type restriction: Cannot create ${childType} under ${parentType}. ${restrictions.reason || ''}`,
		);

		return false;
	}

	return true;
}

// Enhanced validation function with detailed error messages
export function validateStatementTypeHierarchy(
	parentStatement: string | { statementType: StatementType },
	childType: StatementType,
): { allowed: boolean; reason?: string } {
	// Handle 'top' case and string case
	if (parentStatement === 'top' || typeof parentStatement === 'string') {
		return { allowed: true };
	}

	const parentType = parentStatement.statementType;
	const restrictions = TYPE_RESTRICTIONS[parentType];

	if (restrictions?.disallowedChildren?.includes(childType)) {
		return {
			allowed: false,
			reason: restrictions.reason || `Cannot create ${childType} under ${parentType}`,
		};
	}

	return { allowed: true };
}
export const statementTitleToDisplay = (statement: string, titleLength: number) => {
	const _title = statement.split('\n')[0].replace(/\*/g, '') || statement.replace(/\*/g, '');

	const titleToSet =
		_title.length > titleLength - 3 ? _title.substring(0, titleLength) + '...' : _title;

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
	const fontSize = Math.max(baseFontSize - fontSizeMultiplier * text.length, maxSize);

	return `${fontSize}px`;
}

export function getTitle(statement: Statement | undefined) {
	try {
		if (!statement) return '';

		const title = statement.statement.split('\n')[0].replace(/\*/g, '');

		return title;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getTitle' });

		return '';
	}
}

export function getDescription(statement: Statement) {
	try {
		if (!statement) throw new Error('No statement');

		const description = statement.statement.split('\n').slice(1).join('\n');

		return description;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getDescription' });

		return '';
	}
}

export function getSetTimerId(statementId: string, order: number) {
	return `${statementId}--${order}`;
}

export function getRoomTimerId(statementId: string, roomNumber: number, order: number) {
	return `${statementId}--${roomNumber}--${order}`;
}

export function getStatementSubscriptionId(
	statementId: string,
	userId: string,
): string | undefined {
	try {
		if (!statementId) throw new Error('No statementId');

		return `${userId}--${statementId}`;
	} catch (error) {
		logError(error, { operation: 'general.helpers.getStatementSubscriptionId' });

		return undefined;
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
		logError(error, { operation: 'general.helpers.getFirstName' });

		return '';
	}
}

export function getNumberDigits(number: number): number {
	const _number = Math.floor(number);

	return _number.toString().length;
}

export function isProduction(): boolean {
	// In test environment, always return false
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
		return false;
	}

	return window.location.hostname !== 'localhost';
}

export const handleCloseInviteModal = (setShowModal: (show: boolean) => void) => {
	const inviteModal = document.querySelector('.inviteModal');
	if (inviteModal) {
		inviteModal.classList.add('closing');
		setTimeout(() => {
			setShowModal(false);
		}, 400);
	} else {
		setShowModal(false);
	}
};

export function getLastElements(array: Array<unknown>, number: number): Array<unknown> {
	return array.slice(Math.max(array.length - number, 1));
}

const dateParts = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'numeric',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
});

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
	return parts.find((p) => p.type === type)?.value || '';
}

export function getTime(timeMs: number): string {
	const nowMs = Date.now();

	const timeParts = dateParts.formatToParts(timeMs);
	const nowParts = dateParts.formatToParts(nowMs);

	const timeDay = getPart(timeParts, 'day');
	const timeMonth = getPart(timeParts, 'month');
	const timeYear = getPart(timeParts, 'year');
	const timeHour = getPart(timeParts, 'hour');
	const timeMinute = getPart(timeParts, 'minute');

	const nowDay = getPart(nowParts, 'day');
	const nowMonth = getPart(nowParts, 'month');
	const nowYear = getPart(nowParts, 'year');

	if (nowYear !== timeYear) {
		return `${timeDay}/${timeMonth}/${timeYear} ${timeHour}:${timeMinute}`;
	} else if (nowDay === timeDay && nowMonth === timeMonth) {
		return `${timeHour}:${timeMinute}`;
	} else {
		return `${timeDay}/${timeMonth} ${timeHour}:${timeMinute}`;
	}
}

export function truncateString(text: string, maxLength = 20): string {
	return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export function getLatestUpdateStatements(statements: Statement[]): number {
	if (!statements || statements.length === 0) {
		return 0;
	}

	return statements.reduce(
		(latestUpdate, statement) =>
			statement.lastUpdate > latestUpdate ? statement.lastUpdate : latestUpdate,
		0,
	);
}

export const emojiTransformer = (text: string): string => {
	// Define the sentiment emoji mapping
	const sentimentEmojis = {
		':-1': '😠', // Really disagree
		':-0.75': '🙁', // Strongly disagree
		':-0.5': '😕', // Half disagree
		':-0.25': '😐', // Slightly disagree
		':0': '😐', // Neutral
		':0.25': '🙂', // Slightly agree
		':0.5': '😊', // Half agree
		':0.75': '😄', // Strongly agree
		':1': '😁', // Really agree
	};

	// Transform the text with emoji replacements
	if (!text) return '';

	let result = text;

	// Replace all sentiment codes with corresponding emojis
	// Use a more precise regex pattern that looks for the exact codes
	Object.entries(sentimentEmojis).forEach(([code, emoji]) => {
		// Escape special characters in the code
		const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		// Use lookahead and lookbehind to ensure we're matching standalone codes
		// Or use a regex that matches the code at the start, end, or surrounded by spaces
		const regex = new RegExp(`(^|\\s)${escapedCode}(\\s|$)`, 'g');
		result = result.replace(regex, `$1${emoji}$2`);
	});

	return result;
};

/**
 * Find the closest evaluation value in the array to a given target value
 * @param {Array} array - Array of objects with evaluation property
 * @param {number} targetValue - The value to find the closest match for (-1 to 1)
 * @returns {Object} - The object with the closest evaluation value
 */
export function findClosestEvaluation(array: EnhancedEvaluationThumb[], targetValue = 0) {
	// Validate input
	if (!Array.isArray(array) || array.length === 0) {
		throw new Error('Input must be a non-empty array');
	}

	if (targetValue < -1 || targetValue > 1) {
		throw new Error('Target value must be between -1 and 1');
	}

	// Sort the array by the absolute difference between evaluation and target value
	return array.reduce((closest, current) => {
		const currentDiff = Math.abs(current.evaluation - targetValue);
		const closestDiff = Math.abs(closest.evaluation - targetValue);

		return currentDiff < closestDiff ? current : closest;
	}, array[0]);
}

// APIEndPoint function has been moved to ./apiEndpoint.ts to avoid circular dependencies
