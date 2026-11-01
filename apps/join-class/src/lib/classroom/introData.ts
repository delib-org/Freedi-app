import { Collections, StatementType, statementToParagraph } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import type { DocumentData, Query } from 'firebase/firestore';
import { db, collection, getDocs, query, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';
import { blocksFromParagraphs, type SavedBlock } from './introText';

/**
 * Reads of the introduction text: the paragraph child Statements of the main
 * statement (`parentId == mid`, `statementType == paragraph`). The plan screen
 * and the student phone `get` them once; the projector listens, so a typo the
 * teacher fixes mid-lesson reaches the wall. Never throws into a view: callers
 * catch and keep the plain `description`.
 */

const LISTENER_INTRO = 'projectorIntro';

function introQuery(mainId: string): Query<DocumentData> {
	return query(
		collection(db, Collections.statements),
		where('parentId', '==', mainId),
		where('statementType', '==', StatementType.paragraph),
	);
}

/** Paragraph children -> blocks with their ids, in the teacher's order. Hidden ones are skipped. */
export function savedBlocksOf(children: readonly Statement[]): SavedBlock[] {
	return children
		.filter((child) => child.hide !== true)
		.map((child): SavedBlock => {
			const paragraph = statementToParagraph(child);
			const [block] = blocksFromParagraphs([paragraph]);

			return { ...block, statementId: child.statementId, order: paragraph.order };
		})
		.sort((a, b) => a.order - b.order);
}

/** One `get` of the introduction text. */
export async function fetchIntroBlocks(mainId: string): Promise<SavedBlock[]> {
	const snap = await getDocs(introQuery(mainId));

	return savedBlocksOf(snap.docs.map((d) => d.data() as Statement));
}

/** Live introduction text for the projector. Returns the stop function. */
export function listenIntroBlocks(
	mainId: string,
	onBlocks: (blocks: SavedBlock[]) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		LISTENER_INTRO,
		introQuery(mainId),
		(snap) => onBlocks(savedBlocksOf(snap.docs.map((d) => d.data() as Statement))),
		(error: Error) => {
			console.error('[Projector] intro listener error:', error);
		},
	);
}
