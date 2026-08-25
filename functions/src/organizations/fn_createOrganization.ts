import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import {
	Access,
	Collections,
	Organization,
	OrganizationMember,
	OrganizationRole,
	OrganizationStatus,
	functionConfig,
	getOrganizationMemberId,
} from '@freedi/shared-types';
import { db } from '../db';
import { isSystemAdmin } from '../utils/httpAuth';
import { buildInvitation, getCallerIdentity, normalizeEmailOrThrow } from './orgInvites';
import { sendOrgInvitationEmail } from './orgEmail';

interface CreateOrganizationRequest {
	name: string;
	ownerEmail: string;
	defaultAccess?: Access;
	defaultLanguage?: string;
}

interface CreateOrganizationResult {
	organizationId: string;
	invitationId?: string;
	inviteLink?: string;
}

const ACCESS_VALUES = new Set<string>(Object.values(Access));

/**
 * System admin bootstraps a consultant tenant. When the owner email is the
 * caller's own, the owner membership is written directly; otherwise an owner
 * invitation is minted and its link returned (and emailed, best-effort).
 */
export const fn_createOrganization = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<CreateOrganizationRequest>,
	): Promise<CreateOrganizationResult> => {
		const caller = getCallerIdentity(request);
		if (!(await isSystemAdmin(caller.uid))) {
			throw new HttpsError('permission-denied', 'Only system admins can create organizations');
		}

		const { name, ownerEmail, defaultAccess, defaultLanguage } = request.data ?? {};
		const trimmedName = typeof name === 'string' ? name.trim() : '';
		if (!trimmedName) {
			throw new HttpsError('invalid-argument', 'Organization name is required');
		}
		const normalizedOwnerEmail = normalizeEmailOrThrow(ownerEmail);
		if (defaultAccess !== undefined && !ACCESS_VALUES.has(defaultAccess)) {
			throw new HttpsError('invalid-argument', 'Invalid defaultAccess');
		}
		if (defaultLanguage !== undefined && typeof defaultLanguage !== 'string') {
			throw new HttpsError('invalid-argument', 'Invalid defaultLanguage');
		}

		const now = Date.now();
		const orgRef = db.collection(Collections.organizations).doc();
		const organizationId = orgRef.id;
		const ownerIsCaller = caller.email !== null && caller.email === normalizedOwnerEmail;

		const organization: Organization = {
			organizationId,
			name: trimmedName,
			status: OrganizationStatus.active,
			createdBy: caller.uid,
			createdAt: now,
			lastUpdate: now,
			memberCount: ownerIsCaller ? 1 : 0,
			questionCount: 0,
			...(defaultAccess && { defaultAccess }),
			...(defaultLanguage?.trim() && { defaultLanguage: defaultLanguage.trim() }),
		};

		const batch = db.batch();
		batch.set(orgRef, organization);

		if (ownerIsCaller) {
			const memberId = getOrganizationMemberId(organizationId, caller.uid);
			const member: OrganizationMember = {
				memberId,
				organizationId,
				userId: caller.uid,
				email: normalizedOwnerEmail,
				displayName: caller.displayName,
				role: OrganizationRole.owner,
				addedAt: now,
				addedBy: caller.uid,
				lastUpdate: now,
			};
			batch.set(db.collection(Collections.organizationMembers).doc(memberId), member);
			await batch.commit();

			logger.info('[fn_createOrganization] Created with caller as owner', {
				organizationId,
				ownerUid: caller.uid,
			});

			return { organizationId };
		}

		const built = buildInvitation({
			organizationId,
			organizationName: trimmedName,
			invitedEmail: normalizedOwnerEmail,
			role: OrganizationRole.owner,
			inviter: caller,
			now,
		});
		batch.set(
			db.collection(Collections.organizationInvitations).doc(built.invitation.invitationId),
			built.invitation,
		);
		await batch.commit();

		await sendOrgInvitationEmail({
			invitation: built.invitation,
			rawToken: built.rawToken,
			language: organization.defaultLanguage?.toLowerCase().startsWith('he') ? 'he' : 'en',
		});

		logger.info('[fn_createOrganization] Created with pending owner invite', {
			organizationId,
			invitationId: built.invitation.invitationId,
			ownerEmail: normalizedOwnerEmail,
		});

		return {
			organizationId,
			invitationId: built.invitation.invitationId,
			inviteLink: built.inviteLink,
		};
	},
);
