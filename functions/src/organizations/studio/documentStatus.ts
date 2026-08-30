import { Collections, QuestionStatus, Statement, StatementType } from '@freedi/shared-types';
import { db } from '../../db';

/**
 * A Sign document's run state lives in the ad-hoc `signSettings` map the Sign
 * app reads (not in `statementSettings.questionStatus`):
 *   open   → visible + suggestions enabled
 *   frozen → visible, read-only
 *   closed → visible, suggestions off, read-only
 *   review (not yet open) → `isHidden: true` (admins only)
 */
export interface SignSettingsPatch {
	isHidden?: boolean;
	isFrozen?: boolean;
	enableSuggestions?: boolean;
	isPublic?: boolean;
}

/** The review state a freshly built document starts in. */
export const SIGN_REVIEW_SETTINGS: SignSettingsPatch = {
	isHidden: true,
	isPublic: true,
	isFrozen: false,
	enableSuggestions: false,
};

export function isSignDocument(
	statement: Pick<Statement, 'statementType' | 'isDocument'>,
): boolean {
	return statement.statementType === StatementType.document || statement.isDocument === true;
}

export function signSettingsForStatus(status: QuestionStatus): SignSettingsPatch {
	switch (status) {
		case 'frozen':
			return { isHidden: false, isFrozen: true };
		case 'closed':
			return { isHidden: false, isFrozen: true, enableSuggestions: false };
		case 'live':
		default:
			return { isHidden: false, isFrozen: false, enableSuggestions: true };
	}
}

export async function setDocumentStatus(
	statementId: string,
	status: QuestionStatus,
	now: number,
): Promise<void> {
	const patch = signSettingsForStatus(status);
	const update: Record<string, unknown> = { lastUpdate: now };
	Object.entries(patch).forEach(([key, value]) => {
		update[`signSettings.${key}`] = value;
	});
	// Mirror onto questionStatus too so Studio's generic readers agree.
	update['statementSettings.questionStatus'] = status;
	await db.collection(Collections.statements).doc(statementId).update(update);
}
