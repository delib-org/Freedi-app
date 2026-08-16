/**
 * What just happened in the square, as an announcement rather than a phone call.
 *
 * The statements and scores listeners used to call four detector functions in
 * `notifications.ts` directly, from inside their snapshot handlers. That made a
 * genuine import cycle — proposals imports notifications, notifications imports
 * proposals — which worked only because both sides are call-time, and was
 * documented as "benign" in a comment where nobody reading either file alone
 * would find it.
 *
 * It also meant the data layer decided when a toast should fire. A Firestore
 * snapshot arriving is a fact; whether that fact deserves a celebration is a
 * policy, and the two do not belong in the same function.
 *
 * So: the listeners emit, and whoever cares subscribes. proposals.ts no longer
 * imports notifications.ts at all.
 */

export interface AgoraEvents {
	/** A statements snapshot has been applied to state. */
	'statements:changed': { sessionId: string; userId: string };
	/** A scores snapshot has been applied; classMax is the strongest bridge now. */
	'scores:changed': { sessionId: string; userId: string; classMax: number };
}

type Handler<K extends keyof AgoraEvents> = (payload: AgoraEvents[K]) => void;

/**
 * Handlers are stored loosely and narrowed at the boundary. The map cannot be
 * both keyed by event and generic over the handler without a cast somewhere;
 * confining that cast to these two functions keeps every CALLER type-safe,
 * which is where it matters.
 */
const handlers = new Map<keyof AgoraEvents, Set<(payload: never) => void>>();

export function on<K extends keyof AgoraEvents>(event: K, handler: Handler<K>): () => void {
	let set = handlers.get(event);
	if (!set) {
		set = new Set();
		handlers.set(event, set);
	}
	set.add(handler as (payload: never) => void);

	return () => set?.delete(handler as (payload: never) => void);
}

/**
 * Announce. A throwing subscriber must never take down the snapshot handler
 * that emitted — a broken toast is not worth losing the square over.
 */
export function emit<K extends keyof AgoraEvents>(event: K, payload: AgoraEvents[K]): void {
	const set = handlers.get(event);
	if (!set) return;
	for (const handler of set) {
		try {
			(handler as Handler<K>)(payload);
		} catch (error) {
			console.error(`[Events] ${event} subscriber failed:`, error);
		}
	}
}

/** Drop every subscription. Called when the deliberation listeners are torn down. */
export function clearEventSubscribers(): void {
	handlers.clear();
	// Whoever subscribed must be told, or they will think they still are.
	onCleared.forEach((fn) => fn());
}

const onCleared = new Set<() => void>();

/** Register a callback for when subscriptions are dropped wholesale. */
export function onSubscribersCleared(fn: () => void): void {
	onCleared.add(fn);
}
