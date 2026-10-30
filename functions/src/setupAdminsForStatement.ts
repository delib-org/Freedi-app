import { logger } from 'firebase-functions/v1';
import { Collections, Role, Statement, createSubscription } from '@freedi/shared-types';
import { db } from './db';
import { logError } from './utils/errorHandling';
import { trustedAdminUids } from './utils/subscriptionIdentity';

const TOP = 'top';
/** Cap on inherited admins, against escalation in deep hierarchies. */
export const MAX_INHERITED_ADMINS = 20;

/** Admin uids of `statementId`, from genuine admin subscriptions only. */
async function readTrustedAdmins(statementId: string): Promise<string[]> {
	const snap = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', statementId)
		.where('role', '==', Role.admin)
		.get();

	// Only docs whose id is {userId}--{statementId}; the uid comes from userId,
	// never from user.uid (the server's copies store the statement's creator there).
	return trustedAdminUids(snap.docs, statementId);
}

/**
 * Sets up admin subscriptions for a new statement: the creator, the admins of
 * the top parent (admins of every descendant) and of the direct parent (admins
 * of its children only), capped at MAX_INHERITED_ADMINS inherited admins.
 */
export async function setupAdminsForStatement(statement: Statement): Promise<void> {
	try {
		const creatorUid = statement.creator.uid;
		const adminsToAdd = new Set<string>([creatorUid]);

		const topParentId = statement.topParentId || statement.parentId;
		if (topParentId && topParentId !== TOP && topParentId !== statement.statementId) {
			(await readTrustedAdmins(topParentId)).forEach((uid) => adminsToAdd.add(uid));
		}

		const { parentId } = statement;
		if (parentId && parentId !== TOP && parentId !== topParentId) {
			(await readTrustedAdmins(parentId)).forEach((uid) => adminsToAdd.add(uid));
		}

		let otherAdminIds = Array.from(adminsToAdd).filter((uid) => uid !== creatorUid);
		if (otherAdminIds.length > MAX_INHERITED_ADMINS) {
			logger.warn(
				`Admin cap hit: ${otherAdminIds.length} inherited admins for statement ${statement.statementId}, limiting to ${MAX_INHERITED_ADMINS}`,
			);
			otherAdminIds = otherAdminIds.slice(0, MAX_INHERITED_ADMINS);
		}

		// createSubscription takes only the uid from `user` (it stores the
		// statement's creator as `user`), so no lookup of the admins' profiles.
		const batch = db.batch();
		const admins = [statement.creator, ...otherAdminIds.map((uid) => ({ uid, displayName: '' }))];
		for (const user of admins) {
			const subscription = createSubscription({
				statement,
				role: Role.admin,
				user,
				getEmailNotification: true,
				getInAppNotification: true,
				getPushNotification: true,
			});
			if (subscription?.statementsSubscribeId) {
				batch.set(
					db.collection(Collections.statementsSubscribe).doc(subscription.statementsSubscribeId),
					subscription,
				);
			}
		}

		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'statementCreation.setupAdminsForStatement',
			statementId: statement.statementId,
			userId: statement.creator?.uid,
		});
		throw error;
	}
}
