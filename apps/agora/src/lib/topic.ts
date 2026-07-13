import m from 'mithril';
import { db, doc, getDoc } from './firebase';
import { Collections, AgoraTopicPackage, AgoraTopicPackageSchema } from '@freedi/shared-types';
import { parse } from 'valibot';

const cache = new Map<string, AgoraTopicPackage>();
let pending: string | null = null;

export function getTopicPackage(topicPackageId: string): AgoraTopicPackage | null {
	return cache.get(topicPackageId) ?? null;
}

/** Load a topic package once and cache it; redraws when it lands. */
export function loadTopicPackage(topicPackageId: string): void {
	if (cache.has(topicPackageId) || pending === topicPackageId) return;
	pending = topicPackageId;

	getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId))
		.then((snapshot) => {
			if (snapshot.exists()) {
				cache.set(topicPackageId, parse(AgoraTopicPackageSchema, snapshot.data()));
			}
			pending = null;
			m.redraw();
		})
		.catch((error: unknown) => {
			console.error('[Topic] Loading topic package failed:', error);
			pending = null;
			m.redraw();
		});
}
