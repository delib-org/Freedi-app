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
