import { DeliberativeElement, Statement } from '@freedi/shared-types';

const votingColors = [
	'var(--voting-palette-pair-1-light)',
	'var(--voting-palette-pair-1-dark)',
	'var(--voting-palette-pair-2-light)',
	'var(--voting-palette-pair-2-dark)',
	'var(--voting-palette-pair-3-light)',
	'var(--voting-palette-pair-3-dark)',
	'var(--voting-palette-pair-4-light)',
	'var(--voting-palette-pair-4-dark)',
	'var(--voting-palette-pair-5-light)',
	'var(--voting-palette-pair-5-dark)',
	'var(--voting-palette-pair-6-light)',
	'var(--voting-palette-pair-6-dark)',
	'var(--voting-palette-pair-7-light)',
	'var(--voting-palette-pair-7-dark)',
	'var(--voting-palette-pair-8-light)',
	'var(--voting-palette-pair-8-dark)',
	'var(--voting-palette-pair-9-light)',
	'var(--voting-palette-pair-9-dark)',
	'var(--voting-palette-pair-10-light)',
	'var(--voting-palette-pair-10-dark)',
	'var(--voting-palette-pair-11-light)',
	'var(--voting-palette-pair-11-dark)',
	'var(--voting-palette-pair-12-light)',
	'var(--voting-palette-pair-12-dark)',
	'var(--voting-palette-pair-13-light)',
	'var(--voting-palette-pair-13-dark)',
	'var(--voting-palette-pair-14-light)',
	'var(--voting-palette-pair-14-dark)',
	'var(--voting-palette-pair-15-light)',
	'var(--voting-palette-pair-15-dark)',
	'var(--voting-palette-pair-16-light)',
	'var(--voting-palette-pair-16-dark)',
	'var(--voting-palette-pair-17-light)',
	'var(--voting-palette-pair-17-dark)',
	'var(--voting-palette-pair-18-light)',
	'var(--voting-palette-pair-18-dark)',
	'var(--voting-palette-pair-19-light)',
	'var(--voting-palette-pair-19-dark)',
];

export const getRandomColor = (existingColors: string[]): string => {
	let color = votingColors[Math.floor(Math.random() * votingColors.length)];

	while (existingColors.includes(color)) {
		color = votingColors[Math.floor(Math.random() * votingColors.length)];
	}

	return color;
};

// Stable hash so an option without a stored color still gets the same
// palette entry on every render, device and session.
const hashToPaletteIndex = (id: string): number => {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) % votingColors.length;
	}

	return hash;
};

/**
 * Colour to paint an option with. Statements created before colours were
 * assigned - or through a path that skips `getRandomColor` - have no `color`,
 * which used to render the whole bar transparent. Fall back to a deterministic
 * palette entry instead of leaving the option unpainted.
 */
export const getOptionColor = (option: Pick<Statement, 'color' | 'statementId'>): string => {
	if (option.color) return option.color;

	return votingColors[hashToPaletteIndex(option.statementId)];
};

export const getSiblingOptionsByParentId = (
	parentId: string,
	statements: Statement[],
): Statement[] => {
	return statements.filter((statement) => {
		return (
			statement.parentId === parentId &&
			statement.deliberativeElement === DeliberativeElement.option
		);
	});
};

export const getExistingOptionColors = (options: Statement[]): string[] => {
	const colors = options.flatMap((option: Statement) => option.color ?? []);

	return colors;
};
