import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v1';
import { Collections, Role, Statement, createSubscription } from '@freedi/shared-types';
import { db } from './db';
import { logError } from './utils/errorHandling';
import { lookupPersonIdentities, neutralIdentity, PersonIdentity } from './utils/personIdentity';
import { trustedAdminUids } from './utils/subscriptionIdentity';

const TOP = 'top';
/** Cap on inherited admins, against escalation in deep hierarchies. */
export const MAX_INHERITED_ADMINS = 20;
const MILLIS_PER_SECOND = 1000;
const PROFILE_LOOKUP_TIMEOUT_SECONDS = 5;
/** A hung Auth or usersV2 call must not delay, or outlive the trigger with, the admin docs. */
export const PROFILE_LOOKUP_TIMEOUT_MS = PROFILE_LOOKUP_TIMEOUT_SECONDS * MILLIS_PER_SECOND;

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

function withLookupTimeout<T>(lookup: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Profile lookup timed out after ${PROFILE_LOOKUP_TIMEOUT_MS}ms`)),
			PROFILE_LOOKUP_TIMEOUT_MS,
		);
	});

	return Promise.race([lookup, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Who the inherited admins really are, in the order given. Never fails: a lookup
 * problem must not cost anyone their admin subscription, so it degrades to a
 * nameless identity (the client shows a neutral name), never to the creator's.
 */
async function identitiesOfInheritedAdmins(
	uids: string[],
	statementId: string,
): Promise<PersonIdentity[]> {
	if (uids.length === 0) return [];
	const logLookupError = (error: unknown): void =>
		logError(error, {
			operation: 'statementCreation.setupAdminsForStatement.identities',
			statementId,
			metadata: { admins: uids.length },
		});
	try {
		const found = await withLookupTimeout(
			lookupPersonIdentities(db, getAuth(), uids, { onAuthFailure: logLookupError }),
		);

		return uids.map((uid) => found.get(uid) ?? neutralIdentity(uid));
	} catch (error) {
		logLookupError(error);

		return uids.map(neutralIdentity);
	}
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

		const inherited = await identitiesOfInheritedAdmins(otherAdminIds, statement.statementId);

		const batch = db.batch();
		for (const person of [statement.creator, ...inherited]) {
			const subscription = createSubscription({
				statement,
				role: Role.admin,
				user: person,
				getEmailNotification: true,
				getInAppNotification: true,
				getPushNotification: true,
			});
			if (subscription?.statementsSubscribeId) {
				// createSubscription() sets no createdAt, yet the Members list and
				// its count query order by it: a subscription without one is never
				// listed. The admins joined when the statement was created. Merge, so
				// the client's own write of this subscription (createdAt included)
				// is completed rather than replaced.
				// It also stores the statement's creator as `user` whoever the
				// subscriber is, so an inherited admin's real identity goes on top.
				batch.set(
					db.collection(Collections.statementsSubscribe).doc(subscription.statementsSubscribeId),
					{
						...subscription,
						createdAt: statement.createdAt,
						...(person.uid === creatorUid ? {} : { user: person }),
					},
					{ merge: true },
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
