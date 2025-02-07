import { db } from './index';
import { isEqualObjects } from './helpers';
import { Change, logger } from 'firebase-functions/v1';
import { Collections } from '../../src/types/enums';
import { StatementSchema } from '../../src/types/statement';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';

/**
 * Statement Settings Security Model
 * -------------------------------
 *
 * Purpose:
 * Protect statement settings from unauthorized modifications by enforcing that only
 * admin-triggered Cloud Functions can modify these settings.
 *
 * Implementation:
 * 1. Client-side Updates:
 *    - Users submit setting changes through Collection.statementSettings
 *    - This creates an audit trail and ensures proper validation
 *
 * 2. Server-side Processing:
 *    - Cloud Functions listen to Collection.statementSettings changes
 *    - Only these functions have permission to update the settings in statements
 *
 * 3. Security Rules:
 *    - Block direct client modifications to settings fields in statements
 *    - Allow only authenticated Cloud Functions to modify these fields
 *    - Regular users can still read settings and modify non-settings fields
 *
 * Example Flow:
 * User -> Collection.statementSettings -> Cloud Function -> Statement.settings
 *
 * Protected Fields:
 * - statement.settings
 * - statement.documentSettings
 * - [Add other protected settings fields here]
 */

export async function updateSettings(
	e: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			statementId: string;
		}
	>
) {
	if (!e.data) return;

	try {
		const statementId = e.params.statementId;

		if (!statementId) throw new Error('No statementId provided');

		const before = parse(StatementSchema, e.data.before.data());
		const after = parse(StatementSchema, e.data.after.data());

		//Update question settings
		if (!isEqualObjects(before?.questionSettings, after?.questionSettings)) {
			//update question settings with new settings
			if (after?.questionSettings) {
				db.collection(Collections.statements).doc(statementId).update({
					questionSettings: after.questionSettings,
				});
			}
		}

		//Update statement settings
		if (!isEqualObjects(before?.statementSettings, after?.statementSettings)) {
			//update statement with new settings

			if (after?.statementSettings) {
				await db.collection(Collections.statements).doc(statementId).update({
					statementSettings: after?.statementSettings,
				});
			}
		}

		return;
	} catch (error) {
		logger.error(error);

		return;
	}
}
