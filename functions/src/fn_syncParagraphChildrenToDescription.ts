/**
 * Firestore trigger: paragraph child Statements → parent.description.
 *
 * Per project convention (see CLAUDE.md "Paragraphs are child Statements"):
 * the canonical rich body of a Statement is its set of paragraph child
 * Statements (statementType === paragraph). For previews, cards, and hubs
 * we keep a denormalized `description` field on the parent that joins the
 * paragraph text. This trigger keeps that cache in sync.
 *
 * Fires on any write (created / updated / deleted) to a paragraph statement.
 * Re-queries every paragraph child of the parent, sorts by `order` (falling
 * back to `createdAt`), joins the text, and writes to `parent.description`.
 *
 * Idempotent and bounded: writes only when the joined text changes; truncates
 * at MAX_DESCRIPTION_LENGTH.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

const MAX_DESCRIPTION_LENGTH = 5000;

export const fn_syncParagraphChildrenToDescription = onDocumentWritten(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
		memory: '256MiB',
	},
	async (event) => {
		const before = event.data?.before.data() as Statement | undefined;
		const after = event.data?.after.data() as Statement | undefined;

		// Determine which paragraph parent to refresh:
		// - on update: the parent of the (still-paragraph) doc
		// - on create: same as update
		// - on delete: parentId of `before`
		const candidate = after ?? before;
		if (!candidate) return null;

		// Fast filter: this trigger only cares about paragraph children.
		const wasParagraph = before?.statementType === StatementType.paragraph;
		const isParagraph = after?.statementType === StatementType.paragraph;
		if (!wasParagraph && !isParagraph) return null;

		const parentId = candidate.parentId;
		if (!parentId || parentId === 'top') return null;

		// Skip non-content edits to avoid feedback loops.
		if (
			wasParagraph &&
			isParagraph &&
			before?.statement === after?.statement &&
			(before?.order ?? null) === (after?.order ?? null) &&
			(before?.blockType ?? null) === (after?.blockType ?? null) &&
			(before?.hide ?? false) === (after?.hide ?? false)
		) {
			return null;
		}

		try {
			const db = getFirestore();
			const snap = await db
				.collection(Collections.statements)
				.where('parentId', '==', parentId)
				.where('statementType', '==', StatementType.paragraph)
				.get();

			const paragraphs = snap.docs
				.map((d) => d.data() as Statement)
				.filter((p) => p.hide !== true);

			paragraphs.sort((a, b) => {
				const ao = a.order ?? a.createdAt ?? 0;
				const bo = b.order ?? b.createdAt ?? 0;

				return ao - bo;
			});

			let joined = '';
			let truncated = false;
			for (const p of paragraphs) {
				const text = (p.statement ?? '').trim();
				if (!text) continue;
				const next = joined.length === 0 ? text : `${joined}\n\n${text}`;
				if (next.length > MAX_DESCRIPTION_LENGTH) {
					joined = `${joined}\n\n…[truncated]`;
					truncated = true;
					break;
				}
				joined = next;
			}

			const parentRef = db.collection(Collections.statements).doc(parentId);
			const parentDoc = await parentRef.get();
			if (!parentDoc.exists) return null;
			const parent = parentDoc.data() as Statement & { description?: string };

			if ((parent.description ?? '') === joined) {
				return null;
			}

			await parentRef.update({
				description: joined,
				lastUpdate: Date.now(),
				...(truncated ? { descriptionTruncated: true } : {}),
			});

			logger.info('[fn_syncParagraphChildrenToDescription] description synced', {
				parentId,
				paragraphCount: paragraphs.length,
				descriptionLength: joined.length,
			});

			return null;
		} catch (error) {
			logger.error('[fn_syncParagraphChildrenToDescription] failed', {
				parentId,
				error: (error as Error).message,
			});

			return null;
		}
	},
);
