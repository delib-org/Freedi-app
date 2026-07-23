/**
 * Idle-time prefetch of lazy route chunks.
 *
 * The rarely-used screens stay code-split (they don't bloat the initial load),
 * but their chunks are warmed one at a time during browser idle periods after
 * first paint. When the user later navigates to them, the module is already in
 * the cache, so the navigation is instant — no loading spinner.
 *
 * The import specifiers below resolve to the same modules as the lazyWithRetry
 * calls in the route files / SwitchScreen, so Vite emits a single shared chunk
 * per screen; calling import() here simply downloads it early.
 */
const routePrefetchers: Array<() => Promise<unknown>> = [
	// Statement sub-screens (SwitchScreen lazies) — most likely next targets
	() => import('@/view/pages/statement/components/settings/StatementSettings'),
	() => import('@/view/pages/statement/components/map/MindMap'),
	() => import('@/view/pages/statement/components/subQuestionsMap/SubQuestionsMap'),
	() => import('@/view/components/maps/triangle/Triangle'),
	() => import('@/view/components/maps/polarizationIndex/PolarizationIndex'),
	() => import('@/view/pages/statement/components/researchDashboard/ResearchDashboard'),
	// Protected routes
	() => import('@/view/pages/my/My'),
	() => import('@/view/pages/my-suggestions/MySuggestions'),
	() => import('@/view/pages/votingThankYou/VotingThankYou'),
	() => import('@/view/pages/statement/components/map/ClusterMap/ClusterMap'),
	() => import('@/view/pages/statement/components/groups/GroupsCurationPage'),
	() => import('@/view/pages/engagement/EngagementDashboard'),
	() => import('@/view/pages/subscriptions/SubscriptionManager'),
	() => import('@/view/pages/eventControlCenter/EventDashboard'),
	() => import('@/view/pages/settings/ChecNotifications'),
	// Public routes
	() => import('@/view/pages/memberRejection/MemberRejection'),
];

type IdleScheduler = (callback: () => void) => void;

const scheduleIdle: IdleScheduler =
	typeof window !== 'undefined' && 'requestIdleCallback' in window
		? (callback) => window.requestIdleCallback(() => callback(), { timeout: 10000 })
		: (callback) => window.setTimeout(callback, 2000);

let started = false;

export function schedulePrefetchLazyRoutes(): void {
	if (started) return;
	started = true;

	let index = 0;
	const prefetchNext = (): void => {
		if (index >= routePrefetchers.length) return;
		const prefetch = routePrefetchers[index];
		index += 1;
		// Swallow errors: prefetch is opportunistic, and an unhandled chunk-load
		// rejection would trigger the global stale-deployment reload handler.
		prefetch()
			.catch(() => undefined)
			.finally(() => scheduleIdle(prefetchNext));
	};

	scheduleIdle(prefetchNext);
}
