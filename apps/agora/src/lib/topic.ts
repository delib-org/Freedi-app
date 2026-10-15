import m from 'mithril';
import { db, doc, getDoc } from './firebase';
import { Collections, AgoraTopicPackage, AgoraTopicPackageSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import { requestTopicAccess } from './callables';
import { isPermissionDenied } from './permissionDenied';

const cache = new Map<string, AgoraTopicPackage>();
let pending: string | null = null;
/**
 * Reads the rules refused even after asking for access. Without it every
 * redraw (and a screen redraws often) would re-ask, forever. Keyed by package
 * AND session: a later call that names the session still gets its one try.
 */
const refused = new Set<string>();

export function getTopicPackage(topicPackageId: string): AgoraTopicPackage | null {
	return cache.get(topicPackageId) ?? null;
}

async function readPackage(topicPackageId: string): Promise<AgoraTopicPackage | null> {
	const snapshot = await getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId));

	return snapshot.exists() ? parse(AgoraTopicPackageSchema, snapshot.data()) : null;
}

/**
 * Load a topic package once and cache it; redraws when it lands.
 *
 * A private scenario is readable by its author, an admin, and the players of
 * a game built on it — the server marks a player as a reader when they join.
 * Pass the session the screen belongs to: when the read is refused (a seat
 * taken before those marks existed, a teacher running someone else's
 * scenario), the session is the proof the server checks before letting the
 * reader in, and the read is tried once more.
 */
export function loadTopicPackage(topicPackageId: string, sessionId?: string): void {
	const key = `${topicPackageId}|${sessionId ?? ''}`;
	if (cache.has(topicPackageId) || pending === topicPackageId || refused.has(key)) return;
	pending = topicPackageId;

	readPackage(topicPackageId)
		.catch(async (error: unknown) => {
			if (!sessionId || !isPermissionDenied(error)) throw error;
			await requestTopicAccess({ sessionId });

			return readPackage(topicPackageId);
		})
		.then((topic) => {
			if (topic) cache.set(topicPackageId, topic);
			pending = null;
			m.redraw();
		})
		.catch((error: unknown) => {
			if (isPermissionDenied(error)) refused.add(key);
			console.error('[Topic] Loading topic package failed:', error);
			pending = null;
			m.redraw();
		});
}
