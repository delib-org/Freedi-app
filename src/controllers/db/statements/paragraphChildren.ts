import { deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
	Statement,
	StatementType,
	ParagraphType,
	createStatementObject,
} from '@freedi/shared-types';
import { FireStore } from '../config';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

/** Sort paragraph children by `order` ascending, falling back to `createdAt` when
 *  `order` is undefined (legacy paragraphs created before the order field was added). */
export function sortParagraphChildren(paragraphs: Statement[]): Statement[] {
	return [...paragraphs].sort((a, b) => {
		const aOrder = a.order ?? a.createdAt ?? 0;
		const bOrder = b.order ?? b.createdAt ?? 0;

		return aOrder - bOrder;
	});
}

interface AddParagraphArgs {
	host: Statement;
	content: string;
	blockType?: ParagraphType;
	/** Insert position. If omitted, append after the last existing paragraph. */
	insertAfterOrder?: number;
	/** All current paragraph children of `host` — needed to compute the new
	 *  paragraph's `order` and shift siblings when inserting in the middle. */
	currentParagraphs: Statement[];
}

/** Append (or insert) a paragraph child of `host`. Returns the new paragraph's
 *  statementId. Performs sibling re-numbering in a single batch when inserting. */
export async function addParagraphChild({
	host,
	content,
	blockType = ParagraphType.paragraph,
	insertAfterOrder,
	currentParagraphs,
}: AddParagraphArgs): Promise<string | undefined> {
	try {
		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!creator) throw new Error('Creator required to add paragraph');

		const sorted = sortParagraphChildren(currentParagraphs);

		// Compute target order: append by default, otherwise slot after the
		// requested order and shift siblings beyond it.
		let newOrder: number;
		const batch = writeBatch(FireStore);

		if (insertAfterOrder === undefined) {
			const maxOrder = sorted.reduce((max, p) => Math.max(max, p.order ?? p.createdAt ?? 0), -1);
			newOrder = maxOrder + 1;
		} else {
			newOrder = insertAfterOrder + 1;
			// Shift everything strictly above the insert point up by 1.
			for (const p of sorted) {
				const o = p.order ?? p.createdAt ?? 0;
				if (o > insertAfterOrder) {
					batch.update(createStatementRef(p.statementId), { order: o + 1 });
				}
			}
		}

		const newStatement = createStatementObject({
			statement: content,
			statementType: StatementType.paragraph,
			parentId: host.statementId,
			topParentId: host.topParentId || host.statementId,
			creatorId: creator.uid,
			creator,
		});

		if (!newStatement) throw new Error('createStatementObject returned undefined');

		const ref = createStatementRef(newStatement.statementId);
		batch.set(ref, {
			...newStatement,
			blockType,
			order: newOrder,
		});

		await batch.commit();

		return newStatement.statementId;
	} catch (error) {
		logError(error, {
			operation: 'paragraphChildren.addParagraphChild',
			statementId: host.statementId,
		});

		return undefined;
	}
}

interface UpdateParagraphArgs {
	paragraphId: string;
	content?: string;
	blockType?: ParagraphType;
}

/** Patch a paragraph child. Pass only the fields you want changed. */
export async function updateParagraphChild({
	paragraphId,
	content,
	blockType,
}: UpdateParagraphArgs): Promise<boolean> {
	try {
		const patch: Record<string, unknown> = { lastUpdate: getCurrentTimestamp() };
		if (content !== undefined) patch.statement = content;
		if (blockType !== undefined) patch.blockType = blockType;

		await updateDoc(createStatementRef(paragraphId), patch);

		return true;
	} catch (error) {
		logError(error, {
			operation: 'paragraphChildren.updateParagraphChild',
			statementId: paragraphId,
		});

		return false;
	}
}

/** Delete a paragraph child by id. Caller is responsible for the
 *  "never delete the last paragraph" rule. */
export async function deleteParagraphChild(paragraphId: string): Promise<boolean> {
	try {
		await deleteDoc(createStatementRef(paragraphId));

		return true;
	} catch (error) {
		logError(error, {
			operation: 'paragraphChildren.deleteParagraphChild',
			statementId: paragraphId,
		});

		return false;
	}
}

/** Move a paragraph one slot up or down among its siblings. Pass the current
 *  full ordered list and the id to move. Renumbers in a single batch. */
export async function moveParagraphChild(
	paragraphId: string,
	direction: 'up' | 'down',
	currentParagraphs: Statement[],
): Promise<boolean> {
	try {
		const sorted = sortParagraphChildren(currentParagraphs);
		const idx = sorted.findIndex((p) => p.statementId === paragraphId);
		if (idx === -1) return false;

		const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (targetIdx < 0 || targetIdx >= sorted.length) return false;

		const a = sorted[idx];
		const b = sorted[targetIdx];

		// Renumber both blocks rather than swap, so we always end with a clean
		// integer sequence regardless of legacy `createdAt` fallback values.
		const aOrder = a.order ?? a.createdAt ?? idx;
		const bOrder = b.order ?? b.createdAt ?? targetIdx;

		const batch = writeBatch(FireStore);
		batch.update(createStatementRef(a.statementId), { order: bOrder });
		batch.update(createStatementRef(b.statementId), { order: aOrder });
		await batch.commit();

		return true;
	} catch (error) {
		logError(error, {
			operation: 'paragraphChildren.moveParagraphChild',
			statementId: paragraphId,
		});

		return false;
	}
}
