import { Collections, createParagraphChildStatement, getRandomUID } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { db, doc, deleteField, updateDoc, writeBatch } from '@/lib/firebase';
import { getCreator } from '@/lib/store';
import { applyIntroDiff, blocksOf, setVideos } from '@/lib/classroom/gameSnapshotEdit';
import { fetchIntroBlocks } from '@/lib/classroom/introData';
import type { IntroBlock, IntroDiff, SavedBlock } from '@/lib/classroom/introText';
import type { IntroVideo } from '@/lib/classroom/introVideos';
import { editGame, getGame, isGameMode } from './planSource';

/** Firestore writes of the plan screen's "הקדמה" section. Every function throws
 *  on failure; the controller turns that into an inline error with a retry.
 *  On a game the paragraphs and videos live in the game's snapshot (planSource.ts). */

/** The saved intro paragraphs of the lesson or the game. */
export async function loadIntroBlocks(mainId: string): Promise<SavedBlock[]> {
	const game = getGame();
	if (game) return blocksOf(game.snapshot);

	return fetchIntroBlocks(mainId);
}

/** The `doc` map a paragraph child carries when it has a list kind or bold (the shape createParagraphChildStatement writes). */
function docFieldOf(block: IntroBlock, order: number): Record<string, unknown> | null {
	if (block.listType === undefined && block.contentHtml === undefined) return null;

	return {
		order,
		paragraphType: block.type,
		...(block.listType !== undefined && { listType: block.listType }),
		...(block.contentHtml !== undefined && { contentHtml: block.contentHtml }),
	};
}

/**
 * Apply a text diff in one batch: new blocks through `createParagraphChildStatement`,
 * changed ones updated, removed ones deleted. Only changed blocks are touched.
 */
export async function saveIntroDiff(main: Statement, diff: IntroDiff): Promise<void> {
	if (isGameMode()) return editGame((s) => applyIntroDiff(s, diff, getRandomUID));
	const creator = getCreator();
	if (!creator) throw new Error('no signed-in teacher');
	const batch = writeBatch(db);
	const now = Date.now();
	for (const { block, order } of diff.creates) {
		const child = createParagraphChildStatement({
			content: block.content,
			host: main,
			creator,
			order,
			blockType: block.type,
			listType: block.listType,
			contentHtml: block.contentHtml,
		});
		if (!child) throw new Error('createParagraphChildStatement returned nothing');
		batch.set(doc(db, Collections.statements, child.statementId), child);
	}
	for (const { statementId, block, order } of diff.updates) {
		const docField = docFieldOf(block, order);
		batch.update(doc(db, Collections.statements, statementId), {
			statement: block.content,
			order,
			blockType: block.type,
			doc: docField ?? deleteField(),
			lastUpdate: now,
		});
	}
	for (const statementId of diff.deletes) {
		batch.delete(doc(db, Collections.statements, statementId));
	}
	await batch.commit();
}

/**
 * The whole video list in one write (order and titles travel together). The
 * first write from the plan screen also retires the old single `videoUrl`.
 */
export async function saveIntroVideos(mainId: string, videos: IntroVideo[]): Promise<void> {
	if (isGameMode()) return editGame((s) => setVideos(s, videos));
	await updateDoc(doc(db, Collections.statements, mainId), {
		'statementSettings.introVideos': videos,
		'statementSettings.videoUrl': deleteField(),
		lastUpdate: Date.now(),
	});
}
