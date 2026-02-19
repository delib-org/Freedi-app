/**
 * Subscription Repository Interface
 *
 * Defines domain operations for StatementSubscription entities.
 * Implementations handle the underlying data source (Firebase, etc.).
 */

import { StatementSubscription } from '@freedi/shared-types';
import { Unsubscribe } from 'firebase/auth';

export interface ISubscriptionRepository {
	/** Retrieve a single subscription by its ID */
	getById(id: string): Promise<StatementSubscription | undefined>;

	/** Persist a subscription (creates or overwrites) */
	save(subscription: StatementSubscription): Promise<void>;

	/** Update specific fields on an existing subscription */
	update(id: string, fields: Partial<StatementSubscription>): Promise<void>;

	/** Delete a subscription by its ID */
	delete(id: string): Promise<void>;

	/** Get all subscriptions for a given statement */
	getByStatement(statementId: string): Promise<StatementSubscription[]>;

	/** Get all subscriptions for a given user */
	getByUser(userId: string): Promise<StatementSubscription[]>;

	/** Listen to real-time changes on a single subscription document */
	listenToSubscription(
		id: string,
		callback: (subscription: StatementSubscription | undefined) => void,
	): Unsubscribe;
}
