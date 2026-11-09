import { Creator, Role, Statement } from '@freedi/shared-types';
import { notificationService } from '@/services/notificationService';
import { setStatementSubscriptionToDB } from './setSubscriptions';

/**
 * The author's own subscription to their answer carries the channels that
 * "replies" rides on. createStatementWithSubscription writes it; the legacy
 * modal and "better wording" paths create the statement directly, so they
 * write it here. Never rejects (setStatementSubscriptionToDB logs its own).
 */
export async function subscribeAuthorToAnswer(answer: Statement, creator: Creator): Promise<void> {
	await setStatementSubscriptionToDB({
		statement: answer,
		creator,
		role: Role.admin,
		getInAppNotification: true,
		getEmailNotification: false,
		...notificationService.getPushSubscriptionFields(),
	});
}
