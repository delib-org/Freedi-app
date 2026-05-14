import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';

/**
 * Verify the supplied `optionIds` exist, are statements under the given
 * `questionId`, and are of type `option`. Returns the subset that passed.
 *
 * Used by the selective-synthesis callable to prevent admins from
 * enqueuing arbitrary or cross-question IDs.
 *
 * Firestore's `in` query is capped at 30 IDs per call — we chunk.
 */

const IN_QUERY_LIMIT = 30;

function db() {
	return getFirestore();
}

export async function validateOptionIdsBelongToQuestion(
	optionIds: string[],
	questionId: string,
): Promise<string[]> {
	if (optionIds.length === 0) return [];

	const seen = new Set<string>();
	const valid: string[] = [];

	for (let i = 0; i < optionIds.length; i += IN_QUERY_LIMIT) {
		const chunk = optionIds.slice(i, i + IN_QUERY_LIMIT);
		try {
			const snap = await db()
				.collection(Collections.statements)
				.where('statementId', 'in', chunk)
				.get();
			for (const doc of snap.docs) {
				const stmt = doc.data() as Statement;
				if (seen.has(stmt.statementId)) continue;
				if (stmt.parentId !== questionId) continue;
				if (stmt.statementType !== StatementType.option) continue;
				seen.add(stmt.statementId);
				valid.push(stmt.statementId);
			}
		} catch (error) {
			logger.warn('validateOptionIdsBelongToQuestion: chunk query failed', {
				questionId,
				chunkSize: chunk.length,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return valid;
}
