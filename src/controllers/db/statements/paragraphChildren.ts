import { Statement, ParagraphType } from '@freedi/shared-types';
import * as shared from '@freedi/shared-utils';
import { paragraphDeps } from './paragraphStore';

/**
 * Main-app paragraph CRUD. Thin wrappers that delegate to the shared,
 * SDK-agnostic implementation in `@freedi/shared-utils`, injecting the main-app
 * `ParagraphStore` (see `paragraphStore.ts`). Public signatures are preserved so
 * existing callers (e.g. `StatementBody`) are unchanged.
 *
 * Paragraphs are child Statements with `statementType === paragraph` — the
 * canonical rich-body model shared across all Freedi apps.
 */

/** Re-export the pure sorter (order ?? doc.order ?? createdAt). */
export const sortParagraphChildren = shared.sortParagraphChildren;

interface AddParagraphArgs {
	host: Statement;
	content: string;
	blockType?: ParagraphType;
	/** Insert position. If omitted, append after the last existing paragraph. */
	insertAfterOrder?: number;
	/** All current paragraph children of `host`. */
	currentParagraphs: Statement[];
}

/** Append (or insert) a paragraph child of `host`. Returns the new id. */
export function addParagraphChild({
	host,
	content,
	blockType,
	insertAfterOrder,
	currentParagraphs,
}: AddParagraphArgs): Promise<string | undefined> {
	return shared.addParagraphChild(paragraphDeps, {
		host,
		content,
		blockType,
		insertAfterOrder,
		currentParagraphs,
	});
}

interface UpdateParagraphArgs {
	paragraphId: string;
	content?: string;
	blockType?: ParagraphType;
}

/** Patch a paragraph child. Pass only the fields you want changed. */
export function updateParagraphChild(args: UpdateParagraphArgs): Promise<boolean> {
	return shared.updateParagraphChild(paragraphDeps, args);
}

/** Delete a paragraph child by id (hard delete). Caller owns the
 *  "never delete the last paragraph" rule. */
export function deleteParagraphChild(paragraphId: string): Promise<boolean> {
	return shared.deleteParagraphChild(paragraphDeps, paragraphId);
}

/** Move a paragraph one slot up or down among its siblings. */
export function moveParagraphChild(
	paragraphId: string,
	direction: 'up' | 'down',
	currentParagraphs: Statement[],
): Promise<boolean> {
	return shared.moveParagraphChild(paragraphDeps, paragraphId, direction, currentParagraphs);
}
