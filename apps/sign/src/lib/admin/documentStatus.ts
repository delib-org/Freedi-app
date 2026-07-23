/**
 * Document status checks for the Sign app.
 *
 * A frozen document is read-only: signing, commenting, suggesting, evaluating
 * and approving are all rejected server-side while the admin has interactions
 * paused (signSettings.isFrozen).
 */

import { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/**
 * Check whether interactions on a document are frozen by the admin. Fails open
 * (returns false) on error so a transient read failure never blocks a
 * legitimate contribution.
 */
export async function isDocumentFrozen(
	db: Firestore,
	documentId: string
): Promise<boolean> {
	if (!documentId) return false;
	try {
		const snap = await db.collection(Collections.statements).doc(documentId).get();

		return snap.data()?.signSettings?.isFrozen === true;
	} catch (error) {
		logger.error('[DocumentStatus] isDocumentFrozen check failed:', error);

		return false;
	}
}

/** Standard error message returned when a write is rejected on a frozen document. */
export const FROZEN_DOCUMENT_ERROR = 'Interactions on this document are currently paused by the admin';
