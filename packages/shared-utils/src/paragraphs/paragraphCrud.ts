/**
 * Shared paragraph CRUD — the single implementation used by all Freedi apps.
 *
 * A statement's rich body is a set of child Statements with
 * `statementType === paragraph`, ordered by `order`. These functions create,
 * read, update, delete, move, reorder, and bulk-replace those paragraph
 * children against an injected {@link ParagraphStore} (see `types.ts`).
 *
 * Ported from the main app's `src/controllers/db/statements/paragraphChildren.ts`
 * (the most complete prior implementation); return shapes are preserved so the
 * main app's callers do not change.
 */

import { createParagraphChildStatement, ParagraphType } from '@freedi/shared-types';
import type { ListType, Statement } from '@freedi/shared-types';
import type { ParagraphDeps } from './types';

/**
 * Sort paragraph children by `order` ascending, falling back to `doc.order`
 * then `createdAt` for legacy paragraphs created before the `order` field.
 */
export function sortParagraphChildren(paragraphs: Statement[]): Statement[] {
	const key = (p: Statement): number => p.order ?? p.doc?.order ?? p.createdAt ?? 0;

	return [...paragraphs].sort((a, b) => key(a) - key(b));
}

export interface AddParagraphChildArgs {
	host: Pick<Statement, 'statementId' | 'topParentId'>;
	content: string;
	blockType?: ParagraphType;
	listType?: ListType;
	imageUrl?: string;
	imageAlt?: string;
	imageCaption?: string;
	/** Insert position. If omitted, append after the last existing paragraph. */
	insertAfterOrder?: number;
	/** Current paragraph children of `host` — used to compute order / shift siblings. */
	currentParagraphs: Statement[];
	/** Stable id to assign (Sign relies on stable ids). Auto if omitted. */
	statementId?: string;
	/** Transition flag (Sign): also write `doc.isOfficialParagraph`. */
	isOfficial?: boolean;
}

/**
 * Append (or insert) a paragraph child of `host`. Returns the new paragraph's
 * statementId, or undefined on failure. Re-numbers siblings in a single batch
 * when inserting in the middle.
 */
export async function addParagraphChild(
	deps: ParagraphDeps,
	args: AddParagraphChildArgs,
): Promise<string | undefined> {
	const { host, content, insertAfterOrder, currentParagraphs } = args;
	try {
		const creator = deps.creator();
		if (!creator) throw new Error('Creator required to add paragraph');

		const sorted = sortParagraphChildren(currentParagraphs);
		const batch = deps.store.batch();

		let newOrder: number;
		if (insertAfterOrder === undefined) {
			const maxOrder = sorted.reduce(
				(max, p) => Math.max(max, p.order ?? p.doc?.order ?? p.createdAt ?? 0),
				-1,
			);
			newOrder = maxOrder + 1;
		} else {
			newOrder = insertAfterOrder + 1;
			// Shift everything strictly above the insert point up by 1.
			for (const p of sorted) {
				const o = p.order ?? p.doc?.order ?? p.createdAt ?? 0;
				if (o > insertAfterOrder) {
					batch.update(p.statementId, { order: o + 1 });
				}
			}
		}

		const newStatement = createParagraphChildStatement({
			content,
			host,
			creator,
			creatorId: creator.uid,
			order: newOrder,
			blockType: args.blockType,
			...(args.listType !== undefined && { listType: args.listType }),
			...(args.imageUrl !== undefined && { imageUrl: args.imageUrl }),
			...(args.imageAlt !== undefined && { imageAlt: args.imageAlt }),
			...(args.imageCaption !== undefined && { imageCaption: args.imageCaption }),
			...(args.statementId && { statementId: args.statementId }),
			...(args.isOfficial && { isOfficial: true }),
		});

		if (!newStatement) throw new Error('createParagraphChildStatement returned undefined');

		batch.set(newStatement);
		await batch.commit();

		return newStatement.statementId;
	} catch (error) {
		deps.logError(error, {
			operation: 'paragraphCrud.addParagraphChild',
			statementId: host.statementId,
		});

		return undefined;
	}
}

export interface UpdateParagraphChildArgs {
	paragraphId: string;
	content?: string;
	blockType?: ParagraphType;
	listType?: ListType;
	imageUrl?: string;
	imageAlt?: string;
	imageCaption?: string;
}

/** Patch a paragraph child. Pass only the fields you want changed. */
export async function updateParagraphChild(
	deps: ParagraphDeps,
	args: UpdateParagraphChildArgs,
): Promise<boolean> {
	try {
		const patch: Record<string, unknown> = { lastUpdate: deps.store.now() };
		if (args.content !== undefined) patch.statement = args.content;
		if (args.blockType !== undefined) patch.blockType = args.blockType;
		// Rich metadata lives in `doc`; use dot-path keys (both SDKs support them).
		if (args.listType !== undefined) patch['doc.listType'] = args.listType;
		if (args.imageUrl !== undefined) patch['doc.imageUrl'] = args.imageUrl;
		if (args.imageAlt !== undefined) patch['doc.imageAlt'] = args.imageAlt;
		if (args.imageCaption !== undefined) patch['doc.imageCaption'] = args.imageCaption;

		await deps.store.update(args.paragraphId, patch);

		return true;
	} catch (error) {
		deps.logError(error, {
			operation: 'paragraphCrud.updateParagraphChild',
			statementId: args.paragraphId,
		});

		return false;
	}
}

/**
 * Delete a paragraph child. `soft: true` marks `hide: true` (Sign); otherwise
 * hard-deletes (Main/Join). Caller owns the "never delete the last paragraph"
 * rule.
 */
export async function deleteParagraphChild(
	deps: ParagraphDeps,
	paragraphId: string,
	opts?: { soft?: boolean },
): Promise<boolean> {
	try {
		if (opts?.soft) {
			await deps.store.update(paragraphId, { hide: true, lastUpdate: deps.store.now() });
		} else {
			await deps.store.delete(paragraphId);
		}

		return true;
	} catch (error) {
		deps.logError(error, {
			operation: 'paragraphCrud.deleteParagraphChild',
			statementId: paragraphId,
		});

		return false;
	}
}

/**
 * Move a paragraph one slot up or down among its siblings. Renumbers the two
 * affected blocks in a single batch so the result is a clean integer sequence.
 */
export async function moveParagraphChild(
	deps: ParagraphDeps,
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

		const aOrder = a.order ?? a.doc?.order ?? a.createdAt ?? idx;
		const bOrder = b.order ?? b.doc?.order ?? b.createdAt ?? targetIdx;

		const batch = deps.store.batch();
		batch.update(a.statementId, { order: bOrder });
		batch.update(b.statementId, { order: aOrder });
		await batch.commit();

		return true;
	} catch (error) {
		deps.logError(error, {
			operation: 'paragraphCrud.moveParagraphChild',
			statementId: paragraphId,
		});

		return false;
	}
}

/** Set explicit `order` values for a list of paragraphs in a single batch. */
export async function reorderParagraphChildren(
	deps: ParagraphDeps,
	orders: Array<{ statementId: string; order: number }>,
): Promise<boolean> {
	try {
		const batch = deps.store.batch();
		for (const { statementId, order } of orders) {
			batch.update(statementId, { order });
		}
		await batch.commit();

		return true;
	} catch (error) {
		deps.logError(error, { operation: 'paragraphCrud.reorderParagraphChildren' });

		return false;
	}
}

export interface ReplaceParagraphLine {
	content: string;
	blockType?: ParagraphType;
	listType?: ListType;
	/** Keep this id for an existing paragraph so it survives the replace. */
	statementId?: string;
}

/**
 * Replace the entire body of `host`: delete all existing paragraph children and
 * recreate from `lines` (in order). Covers the whole-body re-seed used by Join
 * and MC. Returns the created paragraph ids, or undefined on failure.
 */
export async function replaceAllParagraphChildren(
	deps: ParagraphDeps,
	args: {
		host: Pick<Statement, 'statementId' | 'topParentId'>;
		lines: ReplaceParagraphLine[];
		/** Existing children to delete; queried if omitted. */
		existing?: Statement[];
		isOfficial?: boolean;
	},
): Promise<string[] | undefined> {
	const { host, lines } = args;
	try {
		const creator = deps.creator();
		if (!creator) throw new Error('Creator required to replace paragraphs');

		const existing = args.existing ?? (await deps.store.getParagraphChildren(host.statementId));
		const batch = deps.store.batch();

		// Ids re-used by `lines` are overwritten by their set() below — deleting
		// them too would put two writes on the same doc in one batch.
		const keptIds = new Set(lines.map((line) => line.statementId).filter(Boolean));
		for (const p of existing) {
			if (!keptIds.has(p.statementId)) {
				batch.delete(p.statementId);
			}
		}

		const ids: string[] = [];
		lines.forEach((line, index) => {
			const stmt = createParagraphChildStatement({
				content: line.content,
				host,
				creator,
				creatorId: creator.uid,
				order: index,
				blockType: line.blockType,
				...(line.listType !== undefined && { listType: line.listType }),
				...(line.statementId && { statementId: line.statementId }),
				...(args.isOfficial && { isOfficial: true }),
			});
			if (stmt) {
				batch.set(stmt);
				ids.push(stmt.statementId);
			}
		});

		await batch.commit();

		return ids;
	} catch (error) {
		deps.logError(error, {
			operation: 'paragraphCrud.replaceAllParagraphChildren',
			statementId: host.statementId,
		});

		return undefined;
	}
}

/** Fetch the sorted, non-hidden paragraph children of `hostId`. */
export async function getParagraphChildren(
	deps: ParagraphDeps,
	hostId: string,
): Promise<Statement[]> {
	try {
		const children = await deps.store.getParagraphChildren(hostId);

		return sortParagraphChildren(children);
	} catch (error) {
		deps.logError(error, { operation: 'paragraphCrud.getParagraphChildren', statementId: hostId });

		return [];
	}
}

/**
 * Subscribe to the sorted paragraph children of `hostId` (client SDK only).
 * Throws if the injected store does not support listening.
 */
export function listenParagraphChildren(
	deps: ParagraphDeps,
	hostId: string,
	cb: (paragraphs: Statement[]) => void,
): () => void {
	if (!deps.store.listen) {
		throw new Error('listenParagraphChildren: injected ParagraphStore does not support listen()');
	}

	return deps.store.listen(hostId, (paragraphs) => cb(sortParagraphChildren(paragraphs)));
}
