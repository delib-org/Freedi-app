import { Collections, Role, type StatementSubscription } from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { logError } from '../utils/errorHandling';
import { pushRecipientFromSubscription, resolveFcmSubscribers } from './resolvePushTokens';
import { EXCLUDED_SUBSCRIBER_ROLES } from './subscriberDelivery';

type ChannelPatch = Partial<
	Pick<StatementSubscription, 'getInAppNotification' | 'getPushNotification' | 'lastUpdate'>
>;

/**
 * A moderated join writes every channel off, and approving someone changes only
 * their role, so without this an approved person is never found by the fan-out
 * (which queries for channels that are on). Done here rather than in each client
 * so every way of letting someone in is covered, and so that no client needs the
 * right to write another person's notification choices.
 *
 * In-app goes on; push only for someone with a device to receive it. Email stays
 * off, as for any new member. Never throws: the role change has already happened.
 */
export async function enableNotificationsOnApproval(
	db: Firestore,
	subscriptionId: string,
	before: StatementSubscription,
	after: StatementSubscription,
): Promise<void> {
	if (before.role !== Role.waiting || EXCLUDED_SUBSCRIBER_ROLES.includes(after.role)) return;

	try {
		const patch: ChannelPatch = {};
		if (!after.getInAppNotification) patch.getInAppNotification = true;
		if (!after.getPushNotification) {
			const devices = await resolveFcmSubscribers(db, [pushRecipientFromSubscription(after)]);
			if (devices.length > 0) patch.getPushNotification = true;
		}
		if (Object.keys(patch).length === 0) return;

		await db
			.collection(Collections.statementsSubscribe)
			.doc(subscriptionId)
			.update({ ...patch, lastUpdate: Date.now() });
	} catch (error) {
		logError(error, {
			operation: 'notifications.enableNotificationsOnApproval',
			userId: after.userId,
			statementId: after.statementId,
			metadata: { subscriptionId },
		});
	}
}
