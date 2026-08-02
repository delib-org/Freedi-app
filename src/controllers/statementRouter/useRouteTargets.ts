import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Role, type Statement } from '@freedi/shared-types';
import { deriveRouteTargets, type RouteTarget } from '@freedi/event-core';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { getMainAppResolver } from '@/controllers/events/activityUrls';

/**
 * Cross-App Statement Router — per-card target derivation.
 *
 * Read-only: role comes from subscriptions already in Redux (own statement,
 * else the top parent — the same precedence `useAuthorization` uses), plus
 * the statement-creator check. No listeners, no auto-subscribe side effects,
 * so it is safe to call from every card in a list.
 *
 * v1 is admin/creator-only: for everyone else this returns [] and the
 * "Continue in…" entry point simply does not render.
 */
export function useRouteTargets(statement: Statement): RouteTarget[] {
	const user = useSelector(creatorSelector);
	const ownSubscription = useAppSelector(statementSubscriptionSelector(statement.statementId));
	const topSubscription = useAppSelector(statementSubscriptionSelector(statement.topParentId));

	const role = ownSubscription?.role ?? topSubscription?.role;
	const isCreator = Boolean(user?.uid) && statement.creatorId === user?.uid;
	const isAdmin = isCreator || role === Role.admin || role === Role.creator;

	return useMemo(
		() => deriveRouteTargets(statement, getMainAppResolver(), { isAdmin }),
		[statement, isAdmin],
	);
}
