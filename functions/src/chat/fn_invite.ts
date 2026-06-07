/**
 * Private membership callables (§5d). `redeemInvite` adds the caller to a root's
 * `memberIds` (and the whole subtree) from an `invites/{token}` doc;
 * `updateMembership` lets an existing member add/remove a uid. Both rewrite the
 * subtree in batches (v1 assumes small invited groups — open problem §8).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, functionConfig } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

const INVITES = 'invites';
const BATCH_LIMIT = 450;

interface Invite {
	topParentId: string;
	role?: string;
	invitedBy?: string;
	expiresAt?: number;
	used?: boolean;
}

async function rewriteSubtreeMembers(
	topParentId: string,
	mutate: (current: string[]) => string[],
): Promise<void> {
	const db = getFirestore();
	const rootRef = db.collection(Collections.statements).doc(topParentId);
	const rootSnap = await rootRef.get();
	if (!rootSnap.exists) throw new HttpsError('not-found', 'Conversation not found');

	const descSnap = await db
		.collection(Collections.statements)
		.where('topParentId', '==', topParentId)
		.get();

	const docs = [rootSnap, ...descSnap.docs.filter((d) => d.id !== topParentId)];
	for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
		const batch = db.batch();
		for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
			const current = (doc.data() as Statement).memberIds ?? [];
			batch.update(doc.ref, { memberIds: mutate(current), lastUpdate: Date.now() });
		}
		await batch.commit();
	}
}

export const redeemInvite = onCall<{ token: string }>(
	{ region: functionConfig.region },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Sign in to redeem an invite');
		const { token } = request.data;
		if (!token) throw new HttpsError('invalid-argument', 'token required');

		const db = getFirestore();
		const inviteRef = db.collection(INVITES).doc(token);
		const inviteSnap = await inviteRef.get();
		const invite = inviteSnap.data() as Invite | undefined;
		if (!invite) throw new HttpsError('not-found', 'Invite not found');
		if (invite.used) throw new HttpsError('failed-precondition', 'Invite already used');
		if (invite.expiresAt && invite.expiresAt < Date.now()) {
			throw new HttpsError('deadline-exceeded', 'Invite expired');
		}

		await rewriteSubtreeMembers(invite.topParentId, (current) =>
			current.includes(uid) ? current : [...current, uid],
		);
		await inviteRef.update({ used: true, usedBy: uid, usedAt: Date.now() });

		return { topParentId: invite.topParentId };
	},
);

export const updateMembership = onCall<{
	topParentId: string;
	uid: string;
	action: 'add' | 'remove';
}>({ region: functionConfig.region }, async (request) => {
	const callerUid = request.auth?.uid;
	if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
	const { topParentId, uid, action } = request.data;
	if (!topParentId || !uid) throw new HttpsError('invalid-argument', 'topParentId + uid required');

	const db = getFirestore();
	const rootSnap = await db.collection(Collections.statements).doc(topParentId).get();
	const root = rootSnap.data() as Statement | undefined;
	if (!root) throw new HttpsError('not-found', 'Conversation not found');
	if (!(root.memberIds ?? []).includes(callerUid)) {
		throw new HttpsError('permission-denied', 'Only members can manage membership');
	}

	await rewriteSubtreeMembers(topParentId, (current) =>
		action === 'remove'
			? current.filter((m) => m !== uid)
			: current.includes(uid)
				? current
				: [...current, uid],
	);

	return { topParentId, uid, action };
});
