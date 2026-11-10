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
import { generateDescriptionFromChildren, generatePreviewFromNewestParagraphs } from '../helpers';

/** What fn_syncParagraphChildrenToDescription ends a shortened description with. */
const SYNC_TRUNCATION_MARK = '…[truncated]';

/** Line breaks, and the ` | ` the previews join paragraphs with. */
const TEXT_SEPARATORS = /[\s|]+/g;

export type DescriptionOrigin = 'own-words' | 'full-copy' | 'partial-copy';

function normalizeText(text: string): string {
	return text.replace(TEXT_SEPARATORS, ' ').trim();
}

/** Hidden paragraphs are shown to nobody and never checked, so they vouch for nothing. */
function visibleParagraphs(paragraphChildren: Statement[]): Statement[] {
	return paragraphChildren.filter(
		(paragraph) => paragraph.hide !== true && typeof paragraph.statement === 'string',
	);
}

/** The same order fn_syncParagraphChildrenToDescription writes them in. */
function paragraphTexts(paragraphs: Statement[]): string[] {
	return [...paragraphs]
		.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0))
		.map((paragraph) => paragraph.statement);
}

/** The sync's output: every paragraph in order, or whole leading paragraphs and its mark. */
function isWholeCopy(description: string, texts: string[]): boolean {
	const copy = normalizeText(description);
	if (copy === normalizeText(texts.join(' '))) return true;
	if (!copy.endsWith(SYNC_TRUNCATION_MARK)) return false;

	const kept = copy.slice(0, -SYNC_TRUNCATION_MARK.length).trimEnd();

	return texts.some((_text, count) => kept === normalizeText(texts.slice(0, count).join(' ')));
}

/**
 * Tells a person's own text from a server copy of the paragraphs. A copy must be
 * exactly what a server writer produces from the visible paragraphs: anything
 * looser would let `description`, which an author can write directly, rearrange
 * real words into a new phrase or cut one into another.
 */
export function descriptionOrigin(
	description: string | undefined,
	paragraphChildren: Statement[],
): DescriptionOrigin {
	const paragraphs = visibleParagraphs(paragraphChildren);
	if (!description || paragraphs.length === 0) return 'own-words';
	if (isWholeCopy(description, paragraphTexts(paragraphs))) return 'full-copy';

	const isPreview =
		description === generateDescriptionFromChildren(paragraphs) ||
		description === generatePreviewFromNewestParagraphs(paragraphs);

	return isPreview ? 'partial-copy' : 'own-words';
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
		...paragraphTexts(visibleParagraphs(paragraphChildren)),
	]
		.filter(Boolean)
		.join('\n');
}

/** Whether two texts carry the same words in the same order, whatever the layout. */
export function hasSameWords(earlier: string, later: string): boolean {
	return normalizeText(earlier) === normalizeText(later);
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
