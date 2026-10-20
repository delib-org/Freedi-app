import { object, string, number, InferOutput } from 'valibot';
import { Role } from '../user/UserSettings';

/**
 * One home-feed entry per (user, top-level discussion).
 *
 * The home screen pages this collection by `lastActivity` instead of ordering
 * `statementsSubscribe` by `lastUpdate`. Feed docs are written only by Cloud
 * Functions and NO trigger listens to the collection, so bumping a
 * discussion's activity no longer wakes the subscription/membership triggers.
 *
 * Document id: `{userId}--{statementId}` — the same id as the user's
 * subscription to that top-level statement, so the matching subscription is a
 * direct doc read.
 */
export const UserFeedItemSchema = object({
	feedId: string(), // `{userId}--{statementId}`
	userId: string(),
	statementId: string(), // the top-level statement (topParentId)
	subscriptionId: string(), // the statementsSubscribe doc the home page reads for this entry
	lastActivity: number(), // ms; last activity that should reorder the home list
	createdAt: number(), // ms
});

export type UserFeedItem = InferOutput<typeof UserFeedItemSchema>;

/** Server-only coalescing marker: one doc per top-level statement. */
export const UserFeedThrottleSchema = object({
	statementId: string(),
	lastFanoutAt: number(), // ms of the last fan-out to userFeed
});

export type UserFeedThrottle = InferOutput<typeof UserFeedThrottleSchema>;

/** Roles whose top-level subscriptions get a userFeed entry. */
export const USER_FEED_ROLES: readonly Role[] = [Role.admin, Role.creator, Role.member];

export function getUserFeedId(userId: string, statementId: string): string {
	return `${userId}--${statementId}`;
}

/** True when a role should have a home-feed entry. */
export function isUserFeedRole(role: Role | undefined): boolean {
	return role !== undefined && USER_FEED_ROLES.includes(role);
}

interface TopLevelSubscriptionShape {
	parentId?: string;
	statement?: { parentId?: string };
}

/** Same top-level test the home "topics" query uses (top-level field or legacy embedded field). */
export function isTopLevelSubscription(subscription: TopLevelSubscriptionShape): boolean {
	return subscription.parentId === 'top' || subscription.statement?.parentId === 'top';
}
