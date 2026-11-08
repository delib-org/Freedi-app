import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { OrganizationRole, functionConfig } from '@freedi/shared-types';
import { requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';
import { activityRef, normalizeLabel } from './orgActivities';

interface RenameOrgActivityRequest {
	organizationId: string;
	statementId: string;
	/** New org-facing name; empty or omitted clears it back to the real title. */
	label?: string;
}

/**
 * Renames a linked question on one organization's board. Only the label
 * changes — the question's own title, which is what participants read, is
 * never touched by this call.
 */
export const fn_renameOrgActivity = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RenameOrgActivityRequest>): Promise<{ label: string | null }> => {
		const caller = getCallerIdentity(request);
		const { organizationId, statementId, label } = request.data ?? {};

		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}
		const trimmedLabel = normalizeLabel(label);

		await requireOrgRole(caller.uid, organizationId, [
			OrganizationRole.owner,
			OrganizationRole.admin,
		]);

		const ref = activityRef(organizationId, statementId);
		if (!(await ref.get()).exists) {
			throw new HttpsError('not-found', 'That question is not on this board');
		}
		await ref.update({
			label: trimmedLabel ?? FieldValue.delete(),
			lastUpdate: Date.now(),
		});

		logger.info('[fn_renameOrgActivity] Board name updated', {
			organizationId,
			statementId,
			cleared: !trimmedLabel,
		});

		return { label: trimmedLabel ?? null };
	},
);
