import { store } from '@/redux/store';
import { doc, updateDoc } from 'firebase/firestore';
import { DB } from '../config';
import { Collections, NotificationFrequency } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

/**
 * Update the notification frequency for a specific branch within a subscription.
 * Writes to statementsSubscribe/{userId}--{topParentId}.branchPreferences.{branchId}
 */
export async function updateBranchPreference(
	topParentId: string,
	branchId: string,
	frequency: NotificationFrequency,
): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			logError(new Error('User not found'), {
				operation: 'engagement.db_branchPreferences.updateBranchPreference',
			});

			return;
		}

		const subscriptionId = `${user.uid}--${topParentId}`;
		const subscriptionRef = doc(DB, Collections.statementsSubscribe, subscriptionId);

		await updateDoc(subscriptionRef, {
			[`branchPreferences.${branchId}`]: {
				frequency,
				lastNotifiedAt: Date.now(),
			},
		});
	} catch (error) {
		logError(error, {
			operation: 'engagement.db_branchPreferences.updateBranchPreference',
			metadata: { topParentId, branchId, frequency },
		});
	}
}

/**
 * Update the default notification frequency for an entire discussion subscription.
 */
export async function updateSubscriptionFrequency(
	topParentId: string,
	frequency: NotificationFrequency,
): Promise<void> {
	try {
		const user = store.getState().creator.creator;
		if (!user) {
			logError(new Error('User not found'), {
				operation: 'engagement.db_branchPreferences.updateSubscriptionFrequency',
			});

			return;
		}

		const subscriptionId = `${user.uid}--${topParentId}`;
		const subscriptionRef = doc(DB, Collections.statementsSubscribe, subscriptionId);

		await updateDoc(subscriptionRef, {
			notificationFrequency: frequency,
		});
	} catch (error) {
		logError(error, {
			operation: 'engagement.db_branchPreferences.updateSubscriptionFrequency',
			metadata: { topParentId, frequency },
		});
	}
}
