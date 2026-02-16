import { Paragraph, ParagraphType } from '@freedi/shared-types';

export function logBase(x: number, b: number) {
	return Math.log(x) / Math.log(b);
}

//get top selections from selections
export function getTopSelectionKeys(selections: { [key: string]: number }, limit = 1): string[] {
	const sortedSelections = Object.entries(selections)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	return sortedSelections.map(([key]) => key);
}

export const isEqualObjects = (objA: object | undefined, objB: object | undefined) => {
	return JSON.stringify(objA) === JSON.stringify(objB);
};

export function getRandomColor() {
	//let them be dark colors
	const letters = '0123456789ABCDEF';
	let color = '#';
	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}

	return color;
}

/**
 * Generate a unique paragraph ID
 */
export function generateParagraphId(): string {
	return `p_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Get plain text from paragraphs array
 */
export function getParagraphsText(paragraphs: Paragraph[] | undefined): string {
	if (!paragraphs || paragraphs.length === 0) return '';

	return [...paragraphs]
		.sort((a, b) => a.order - b.order)
		.map((p) => p.content)
		.join('\n');
}

/**
 * Check if paragraphs have content
 */
export function hasParagraphsContent(paragraphs: Paragraph[] | undefined): boolean {
	if (!paragraphs || paragraphs.length === 0) return false;

	return paragraphs.some((p) => p.content && p.content.trim().length > 0);
}

/**
 * Convert text to paragraphs array
 */
export function textToParagraphs(text: string): Paragraph[] | undefined {
	if (!text || !text.trim()) return undefined;

	const lines = text.split('\n').filter((line) => line.trim());

	return lines.map((line, index) => ({
		paragraphId: `p-${Date.now()}-${index}`,
		type: ParagraphType.paragraph,
		content: line,
		order: index,
	}));
}
