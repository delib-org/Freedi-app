export interface ParsedOption {
	title: string;
	description: string;
}

const LEADING_BULLET_RE = /^\s*[•\-*–—]\s*/;
// Numbered list prefixes: "1.", "1)", "1-", "1:" (each followed by whitespace).
// Whitespace after the separator is required so "1.5 km" or "1.2.3" aren't stripped.
const LEADING_NUMBER_RE = /^\s*\d+[.)\-:]\s+/;
const TITLE_DESCRIPTION_SEPARATORS = [' — ', ' – ', ' - ', ': '];

function stripLeadingMarkers(line: string): string {
	let prev = '';
	let curr = line;
	// Apply both strippers repeatedly so combinations like "1. • Title" or
	// "• 1) Title" are fully cleaned regardless of order.
	while (prev !== curr) {
		prev = curr;
		curr = curr.replace(LEADING_NUMBER_RE, '').replace(LEADING_BULLET_RE, '');
	}

	return curr.trim();
}

function splitOnFirstSeparator(line: string): {
	title: string;
	description: string;
} {
	for (const sep of TITLE_DESCRIPTION_SEPARATORS) {
		const idx = line.indexOf(sep);
		if (idx > 0) {
			return {
				title: line.slice(0, idx).trim(),
				description: line.slice(idx + sep.length).trim(),
			};
		}
	}

	return { title: line, description: '' };
}

export function parseBulkOptions(input: string): ParsedOption[] {
	if (!input) return [];

	return input
		.split('\n')
		.map(stripLeadingMarkers)
		.filter((line) => line.length > 0)
		.map(splitOnFirstSeparator)
		.filter((item) => item.title.length > 0);
}
