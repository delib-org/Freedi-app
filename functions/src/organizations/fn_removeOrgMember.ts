import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import {
	Collections,
	OrganizationMember,
	OrganizationRole,
	functionConfig,
	getOrganizationMemberId,
} from '@freedi/shared-types';
import { db } from '../db';
import { demoteOrgMemberOnTopQuestions, requireOrgRole } from './orgAuth';
import { getCallerIdentity } from './orgInvites';

interface RemoveOrgMemberRequest {
	organizationId: string;
	userId: string;
}

interface RemoveOrgMemberResult {
	removed: true;
	demoted: number;
}

/**
 * Owner (or system admin) removes a member. The last owner can never be
 * removed. The user's admin subscriptions on org top questions are demoted to
 * `member` afterwards (questions they created are left alone).
 */
export const fn_removeOrgMember = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<RemoveOrgMemberRequest>): Promise<RemoveOrgMemberResult> => {
		const caller = getCallerIdentity(request);
		const { organizationId, userId } = request.data ?? {};
		if (!organizationId || typeof organizationId !== 'string') {
			throw new HttpsError('invalid-argument', 'organizationId is required');
		}
		if (!userId || typeof userId !== 'string') {
			throw new HttpsError('invalid-argument', 'userId is required');
		}

		await requireOrgRole(caller.uid, organizationId, [OrganizationRole.owner]);

		const memberRef = db
			.collection(Collections.organizationMembers)
			.doc(getOrganizationMemberId(organizationId, userId));
		const memberSnap = await memberRef.get();
		if (!memberSnap.exists) {
			throw new HttpsError('not-found', 'Member not found');
		}
		const target = memberSnap.data() as OrganizationMember;

		if (target.role === OrganizationRole.owner) {
			const ownersSnap = await db
				.collection(Collections.organizationMembers)
				.where('organizationId', '==', organizationId)
				.where('role', '==', OrganizationRole.owner)
				.get();
			if (ownersSnap.size <= 1) {
				throw new HttpsError(
					'failed-precondition',
					'Cannot remove the last owner of an organization',
				);
			}
		}

		const now = Date.now();
		const batch = db.batch();
		batch.delete(memberRef);
		batch.update(db.collection(Collections.organizations).doc(organizationId), {
			memberCount: FieldValue.increment(-1),
			lastUpdate: now,
		});
		await batch.commit();

		const demoted = await demoteOrgMemberOnTopQuestions(organizationId, userId);

		logger.info('[fn_removeOrgMember] Removed', {
			organizationId,
			userId,
			removedBy: caller.uid,
			demoted,
		});

		return { removed: true, demoted };
	},
);
