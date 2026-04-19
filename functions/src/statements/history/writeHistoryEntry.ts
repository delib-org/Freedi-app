/**
 * Write a single entry to `statements/{statementId}/statementHistory`.
 *
 * Designed to be called from Firestore triggers (evaluation / statement update)
 * and from scheduled snapshot jobs. Never stores user identifiers — the
 * only data persisted is aggregated evaluation numbers and (optionally)
 * before/after text diffs.
 */

import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Statement,
	StatementEvaluation,
	StatementHistoryEntry,
	StatementHistorySource,
} from '@freedi/shared-types';
import { db } from '../../index';

interface WriteHistoryEntryInput {
	statement: Statement;
	source: StatementHistorySource;
	isResearch: boolean;
	statementBefore?: string;
	statementAfter?: string;
	descriptionBefore?: string;
	descriptionAfter?: string;
	evaluationDelta?: number;
	evaluationAction?: 'new' | 'update' | 'delete';
}

export async function writeHistoryEntry(input: WriteHistoryEntryInput): Promise<void> {
	try {
		const {
			statement,
			source,
			isResearch,
			statementBefore,
			statementAfter,
			descriptionBefore,
			descriptionAfter,
			evaluationDelta,
			evaluationAction,
		} = input;

		if (!statement.statementId) return;

		const createdAt = Date.now();
		const entryId = `${statement.statementId}_${createdAt}_${Math.random()
			.toString(36)
			.substring(2, 8)}`;

		const entry: StatementHistoryEntry = {
			entryId,
			statementId: statement.statementId,
			topParentId: statement.topParentId,
			createdAt,
			source,
			isResearch: isResearch ? 1 : 0,
			evaluation: statement.evaluation as StatementEvaluation | undefined,
			statementBefore,
			statementAfter,
			descriptionBefore,
			descriptionAfter,
			evaluationDelta,
			evaluationAction,
		};

		// Strip undefined values — Firestore rejects them
		const cleaned = Object.fromEntries(
			Object.entries(entry).filter(([, v]) => v !== undefined),
		);

		await db
			.collection(Collections.statements)
			.doc(statement.statementId)
			.collection(Collections.statementHistory)
			.doc(entryId)
			.set(cleaned);
	} catch (error) {
		logger.warn('[statementHistory] writeHistoryEntry failed:', error);
	}
}
