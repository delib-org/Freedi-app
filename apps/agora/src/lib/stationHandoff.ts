import m from 'mithril';
import {
	createAgoraParticipantId,
	Collections,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import { db, doc, updateDoc } from './firebase';
import { mintStationHandoff } from './callables';
import { handoffRefreshAt, isHandoffFresh, stationReturnMessage } from './flows/linkedStation';

/**
 * The browser half of linked stations (docs/ia/agora-linked-app-stations.md
 * §9.4): fetch the way in BEFORE the tap, so the tap can call `window.open`
 * synchronously (no popup blocker), stamp the visit, and hear the other app
 * say "back to the village".
 */

/** Where the main app lives — the only origin a return message is heard from */
export function mainAppOrigin(): string {
	return (import.meta.env.VITE_MAIN_ORIGIN || 'https://app.wizcol.com').replace(/\/+$/, '');
}

interface Prefetch {
	url?: string;
	expiresAt?: number;
	pending: boolean;
	failed: boolean;
	timer?: number;
}

const prefetches = new Map<string, Prefetch>();
const keyOf = (sessionId: string, itemId: string): string => `${sessionId}--${itemId}`;

async function fetchHandoff(sessionId: string, itemId: string): Promise<void> {
	const key = keyOf(sessionId, itemId);
	const entry: Prefetch = prefetches.get(key) ?? { pending: false, failed: false };
	if (entry.pending) return;
	entry.pending = true;
	entry.failed = false;
	prefetches.set(key, entry);
	try {
		const { url, expiresAt } = await mintStationHandoff({ sessionId, itemId });
		entry.url = url;
		entry.expiresAt = expiresAt;
		window.clearTimeout(entry.timer);
		entry.timer = window.setTimeout(
			() => void fetchHandoff(sessionId, itemId),
			Math.max(0, handoffRefreshAt(expiresAt) - Date.now()),
		);
	} catch (error) {
		entry.failed = true;
		console.error('[StationHandoff] Could not prepare the task link:', error);
	} finally {
		entry.pending = false;
		m.redraw();
	}
}

export type StationLinkStatus = 'ready' | 'preparing' | 'failed';

/** Idempotent per render: start (or keep) the prefetch, and say where it stands */
export function prepareStationTask(sessionId: string, itemId: string): StationLinkStatus {
	const entry = prefetches.get(keyOf(sessionId, itemId));
	if (entry && isHandoffFresh(entry.expiresAt, Date.now())) return 'ready';
	if (entry?.failed && !entry.pending) return 'failed';
	if (!entry?.pending) void fetchHandoff(sessionId, itemId);

	return 'preparing';
}

/** The retry after a failure */
export function retryStationTask(sessionId: string, itemId: string): void {
	void fetchHandoff(sessionId, itemId);
}

export function stopStationPrefetches(): void {
	prefetches.forEach((entry) => window.clearTimeout(entry.timer));
	prefetches.clear();
}

function stampVisit(
	sessionId: string,
	userId: string,
	itemId: string,
	field: 'openedAt' | 'returnedAt',
): void {
	const at = Date.now();
	updateDoc(doc(db, Collections.agoraParticipants, createAgoraParticipantId(sessionId, userId)), {
		[`stationVisits.${itemId}.${field}`]: at,
		lastActive: at,
	}).catch((error: unknown) => {
		// A courtesy signal, like whereabouts: the visit never waits on it
		console.error('[StationHandoff] Stamp visit failed:', error);
	});
}

/**
 * The tap. Opens the prefetched link in a new tab (the PWA's in-app sheet),
 * or, when the browser refuses a new tab, in this one. The code is single
 * use, so a fresh one is fetched at once for the next tap.
 */
export function openStationTask(sessionId: string, itemId: string, userId: string): boolean {
	const key = keyOf(sessionId, itemId);
	const entry = prefetches.get(key);
	if (!entry?.url || !isHandoffFresh(entry.expiresAt, Date.now())) return false;
	const url = entry.url;
	entry.url = undefined;
	entry.expiresAt = undefined;
	stampVisit(sessionId, userId, itemId, 'openedAt');
	// No `noopener`: the other app answers through `window.opener`
	const opened = window.open(url, '_blank');
	if (!opened) {
		window.location.assign(url);

		return true;
	}
	void fetchHandoff(sessionId, itemId);

	return true;
}

/** The student is back at the station — by the return URL or by the opener message */
export function markStationReturned(sessionId: string, userId: string, itemId: string): void {
	stampVisit(sessionId, userId, itemId, 'returnedAt');
}

/**
 * Hear "back to the village" from the tab this station opened. Only from
 * the main app's origin, and only for a linked step of this plan.
 */
export function listenForStationReturn(
	plan: () => readonly AgoraStagePlanItem[],
	onReturn: (itemId: string) => void,
): () => void {
	const receive = (event: MessageEvent<unknown>): void => {
		const itemId = stationReturnMessage(event, [mainAppOrigin()], plan());
		if (!itemId) return;
		onReturn(itemId);
		window.focus();
	};
	window.addEventListener('message', receive);

	return () => window.removeEventListener('message', receive);
}
