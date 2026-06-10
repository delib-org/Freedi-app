/**
 * Shared paragraph CRUD layer. See `paragraphCrud.ts` and `types.ts`.
 */

export type { ParagraphBatch, ParagraphStore, ParagraphDeps } from './types';
export {
	sortParagraphChildren,
	addParagraphChild,
	updateParagraphChild,
	deleteParagraphChild,
	moveParagraphChild,
	reorderParagraphChildren,
	replaceAllParagraphChildren,
	getParagraphChildren,
	listenParagraphChildren,
} from './paragraphCrud';
export type {
	AddParagraphChildArgs,
	UpdateParagraphChildArgs,
	ReplaceParagraphLine,
} from './paragraphCrud';
