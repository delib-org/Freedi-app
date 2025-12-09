// TODO: Import from delib-npm once published with Paragraph types
import { Paragraph, ParagraphType } from '@/types/paragraph';

/**
 * Generate a unique paragraph ID
 * @returns A string like "p_abc12345"
 */
export function generateParagraphId(): string {
	return `p_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Migrate a description string to a paragraphs array
 * Creates a single paragraph from the description content
 * @param description - The description text to migrate
 * @returns Array with single paragraph, or empty array if no content
 */
export function descriptionToParagraphs(description: string): Paragraph[] {
	if (!description?.trim()) return [];

	return [
		{
			paragraphId: generateParagraphId(),
			type: ParagraphType.paragraph,
			content: description.trim(),
			order: 0,
		},
	];
}

/**
 * Generate a preview description from paragraphs array
 * Takes first 200 characters of concatenated paragraph content
 * @param paragraphs - Array of paragraphs
 * @returns Preview string (max 200 chars with ellipsis if truncated)
 */
export function paragraphsToDescription(paragraphs: Paragraph[]): string {
	if (!paragraphs?.length) return '';

	const text = paragraphs
		.sort((a, b) => a.order - b.order)
		.map((p) => p.content)
		.join(' ');

	return text.length > 200 ? text.slice(0, 200) + '...' : text;
}

/**
 * Create a new paragraph with generated ID
 * @param type - The paragraph type (h1, h2, p, li, etc.)
 * @param content - The text content
 * @param order - Position in the document
 * @param listType - Optional list type for li paragraphs
 * @returns A new Paragraph object
 */
export function createParagraph(
	type: ParagraphType,
	content: string,
	order: number,
	listType?: 'ul' | 'ol'
): Paragraph {
	const paragraph: Paragraph = {
		paragraphId: generateParagraphId(),
		type,
		content,
		order,
	};

	if (listType) {
		paragraph.listType = listType;
	}

	return paragraph;
}

/**
 * Sort paragraphs by order
 * @param paragraphs - Array of paragraphs to sort
 * @returns Sorted array (new array, does not mutate original)
 */
export function sortParagraphs(paragraphs: Paragraph[]): Paragraph[] {
	return [...paragraphs].sort((a, b) => a.order - b.order);
}

/**
 * Reorder paragraphs after drag-and-drop
 * Updates the order field for all affected paragraphs
 * @param paragraphs - Current paragraphs array
 * @param fromIndex - Original index of moved item
 * @param toIndex - New index for moved item
 * @returns New array with updated order values
 */
export function reorderParagraphs(
	paragraphs: Paragraph[],
	fromIndex: number,
	toIndex: number
): Paragraph[] {
	const sorted = sortParagraphs(paragraphs);
	const result = [...sorted];
	const [removed] = result.splice(fromIndex, 1);
	result.splice(toIndex, 0, removed);

	// Update order values
	return result.map((p, index) => ({
		...p,
		order: index,
	}));
}

/**
 * Find a paragraph by ID
 * @param paragraphs - Array of paragraphs
 * @param paragraphId - ID to search for
 * @returns The paragraph or undefined
 */
export function findParagraphById(
	paragraphs: Paragraph[],
	paragraphId: string
): Paragraph | undefined {
	return paragraphs.find((p) => p.paragraphId === paragraphId);
}

/**
 * Update a paragraph's content or type
 * @param paragraphs - Current paragraphs array
 * @param paragraphId - ID of paragraph to update
 * @param updates - Fields to update
 * @returns New array with updated paragraph
 */
export function updateParagraph(
	paragraphs: Paragraph[],
	paragraphId: string,
	updates: Partial<Omit<Paragraph, 'paragraphId'>>
): Paragraph[] {
	return paragraphs.map((p) =>
		p.paragraphId === paragraphId ? { ...p, ...updates } : p
	);
}

/**
 * Delete a paragraph by ID
 * @param paragraphs - Current paragraphs array
 * @param paragraphId - ID of paragraph to delete
 * @returns New array without the deleted paragraph, with orders updated
 */
export function deleteParagraph(
	paragraphs: Paragraph[],
	paragraphId: string
): Paragraph[] {
	const filtered = paragraphs.filter((p) => p.paragraphId !== paragraphId);

	// Re-order remaining paragraphs
	return sortParagraphs(filtered).map((p, index) => ({
		...p,
		order: index,
	}));
}

/**
 * Add a new paragraph at a specific position
 * @param paragraphs - Current paragraphs array
 * @param newParagraph - New paragraph to add (without order)
 * @param atIndex - Position to insert (defaults to end)
 * @returns New array with inserted paragraph and updated orders
 */
export function insertParagraph(
	paragraphs: Paragraph[],
	newParagraph: Omit<Paragraph, 'order'>,
	atIndex?: number
): Paragraph[] {
	const sorted = sortParagraphs(paragraphs);
	const insertIndex = atIndex ?? sorted.length;

	const result = [
		...sorted.slice(0, insertIndex),
		{ ...newParagraph, order: insertIndex },
		...sorted.slice(insertIndex),
	];

	// Update order values
	return result.map((p, index) => ({
		...p,
		order: index,
	}));
}
