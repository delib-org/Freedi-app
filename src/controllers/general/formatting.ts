import { logError } from '@/utils/errorHandling';

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

//get first name from full name or first name with first family name letter
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

export function truncateString(text: string, maxLength = 20): string {
	return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
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
	} else if (currentDay !== timeDay && currentMonth === timeMonth && currentYear === timeYear) {
		return `${timeDay}/${timeMonth} ${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
	} else if (currentDay === timeDay && currentMonth === timeMonth && currentYear === timeYear) {
		return `${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
	}

	return `${hours}:${minutes?.toString().length === 1 ? '0' + minutes : minutes}`;
}

export function getNumberDigits(number: number): number {
	const _number = Math.floor(number);

	return _number.toString().length;
}

export function calculateFontSize(text: string, maxSize = 6, minSize = 14) {
	// Set the base font size and a multiplier for adjusting based on text length
	const baseFontSize = minSize;
	const fontSizeMultiplier = 0.2;

	// Calculate the font size based on the length of the text
	const fontSize = Math.max(baseFontSize - fontSizeMultiplier * text.length, maxSize);

	return `${fontSize}px`;
}

export const emojiTransformer = (text: string): string => {
	// Define the sentiment emoji mapping
	const sentimentEmojis = {
		':-1': '\u{1F620}', // Really disagree
		':-0.75': '\u{1F641}', // Strongly disagree
		':-0.5': '\u{1F615}', // Half disagree
		':-0.25': '\u{1F610}', // Slightly disagree
		':0': '\u{1F610}', // Neutral
		':0.25': '\u{1F642}', // Slightly agree
		':0.5': '\u{1F60A}', // Half agree
		':0.75': '\u{1F604}', // Strongly agree
		':1': '\u{1F601}', // Really agree
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
