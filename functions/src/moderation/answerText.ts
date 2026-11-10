/**
 * Which words an answer really carries, for the language check. Pure.
 *
 * `description` cannot be trusted as the record of those words when an answer
 * has paragraph children: three writers fill it, and two of them are lossy.
 *  - fn_syncParagraphChildrenToDescription: every visible paragraph, up to 5,000 characters.
 *  - the title split in onStatementCreated: a preview capped at 200 characters.
 *  - updateParentOnChildUpdate: a preview of the newest 3 only, or '' with no
 *    paragraphs, on any child's edit, a stranger's reply included.
 * So with paragraph children, the title and the children are the source of truth.
 */

import { Statement } from '@freedi/shared-types';

/** What generateDescriptionFromChildren ends a shortened description with. */
const PREVIEW_ELLIPSIS = '...';

/** What fn_syncParagraphChildrenToDescription ends a shortened description with. */
const SYNC_TRUNCATION_MARK = '…[truncated]';

/** Line breaks, and the ` | ` the previews join paragraphs with. */
const TEXT_SEPARATORS = /[\s|]+/g;

export type DescriptionOrigin = 'own-words' | 'full-copy' | 'partial-copy';

function normalizeText(text: string): string {
	return text.replace(TEXT_SEPARATORS, ' ').trim();
}

function wordsOf(normalizedText: string): string[] {
	return normalizedText.split(' ').filter(Boolean);
}

/** The same order fn_syncParagraphChildrenToDescription writes them in. */
function visibleParagraphTexts(paragraphChildren: Statement[]): string[] {
	return paragraphChildren
		.filter((paragraph) => paragraph.hide !== true)
		.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0))
		.map((paragraph) => paragraph.statement);
}

/** A cut preview may end mid-word, so its last word need only begin a real one. */
function isDrawnFromParagraphs(copy: string, paragraphChildren: Statement[]): boolean {
	const known = new Set(
		paragraphChildren.flatMap((paragraph) => wordsOf(normalizeText(paragraph.statement ?? ''))),
	);
	const isCut = copy.endsWith(PREVIEW_ELLIPSIS);
	const uncut = isCut ? copy.slice(0, -PREVIEW_ELLIPSIS.length) : copy;
	const words = wordsOf(uncut.replace(SYNC_TRUNCATION_MARK, ''));
	const partWord = isCut ? words.pop() : undefined;

	return (
		words.every((word) => known.has(word)) &&
		(partWord === undefined || [...known].some((word) => word.startsWith(partWord)))
	);
}

function isWholeCopy(copy: string, paragraphChildren: Statement[]): boolean {
	const paragraphs = normalizeText(visibleParagraphTexts(paragraphChildren).join(' '));
	if (copy === paragraphs) return true;

	return (
		copy.endsWith(SYNC_TRUNCATION_MARK) &&
		paragraphs.startsWith(copy.slice(0, -SYNC_TRUNCATION_MARK.length).trimEnd())
	);
}

/**
 * Tells a person's own text from a server copy of the paragraphs. Words found
 * in no paragraph are always `own-words`, so writing into `description`
 * directly cannot pass as a copy.
 */
export function descriptionOrigin(
	description: string | undefined,
	paragraphChildren: Statement[],
): DescriptionOrigin {
	if (!description || paragraphChildren.length === 0) return 'own-words';

	const copy = normalizeText(description);
	if (!isDrawnFromParagraphs(copy, paragraphChildren)) return 'own-words';

	return isWholeCopy(copy, paragraphChildren) ? 'full-copy' : 'partial-copy';
}

/**
 * The answer's words as one text for one AI call. Tolerates a malformed
 * `paragraphs`: a throw here would skip the check for the whole answer.
 */
export function answerFullText(answer: Statement, paragraphChildren: Statement[] = []): string {
	const paragraphs = Array.isArray(answer.paragraphs)
		? answer.paragraphs.map((paragraph) => paragraph?.content)
		: [];
	const isOwnDescription = descriptionOrigin(answer.description, paragraphChildren) === 'own-words';

	return [
		answer.statement,
		isOwnDescription ? answer.description : undefined,
		...paragraphs,
		...visibleParagraphTexts(paragraphChildren),
	]
		.filter(Boolean)
		.join('\n');
}

/**
 * Only in this direction: a shortened copy adds no words, but text that grows
 * out of something ending in "..." may add any.
 */
function isShortenedCopy(shortened: string, full: string): boolean {
	return (
		shortened.endsWith(PREVIEW_ELLIPSIS) &&
		full.startsWith(shortened.slice(0, -PREVIEW_ELLIPSIS.length).trimEnd())
	);
}

/** Whether `later` still carries the words of `earlier`, whatever the layout. */
export function hasSameWords(earlier: string, later: string): boolean {
	const earlierText = normalizeText(earlier);
	const laterText = normalizeText(later);

	return earlierText === laterText || isShortenedCopy(laterText, earlierText);
}

/** True when a write touched `description` and none of the answer's other words. */
export function changedOnlyDescription(before: Statement, after: Statement): boolean {
	return (
		before.description !== after.description &&
		hasSameWords(
			answerFullText({ ...before, description: undefined }),
			answerFullText({ ...after, description: undefined }),
		)
	);
}
