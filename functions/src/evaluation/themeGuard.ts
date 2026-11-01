/**
 * Defence in depth for "themes cannot be voted on".
 *
 * Themes (clusters that are not syntheses) are navigation containers; their
 * numbers are roll-ups of their members. The clients no longer offer a vote
 * on a theme, but a stale client or a direct write could still create one.
 * The evaluation triggers call this before anything is counted: a stray
 * evaluation on a theme is deleted and the trigger stops.
 *
 * Deleting the doc fires the delete trigger; for a cluster the updater skips
 * (the condensation aggregator owns cluster numbers), so nothing is reversed
 * that was never counted.
 */

import { logger } from 'firebase-functions/v1';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, isTheme } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { db } from '../index';

/**
 * @returns true when the evaluation targeted a theme and was deleted; the
 *   caller must stop. false when processing should continue.
 */
export async function dropEvaluationOnTheme(
	evaluationSnapshot: DocumentSnapshot,
	statementId: string,
	eventId: string,
): Promise<boolean> {
	const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
	const target = statementDoc.data() as Statement | undefined;

	if (!target || !isTheme(target)) return false;

	logger.info('Ignoring evaluation on a theme (themes are not voted on); deleting it', {
		statementId,
		evaluationId: evaluationSnapshot.id,
		eventId,
	});
	await evaluationSnapshot.ref.delete();

	return true;
}
