import m from 'mithril';
import { Collections } from '@freedi/shared-types';
import type { TableAssignment, TableAssignmentCounter } from '@freedi/shared-types';
import { collection, db, doc, getDocs, query, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { CLASS_LISTENER_KINDS, resilientOnSnapshot } from '../resilientListeners';

/**
 * Reads of the Tables side that the Class teacher screens need: the
 * registrations her Google account hosts (a client query on `hostUid`, which the
 * rules allow), and one live registration with its "registered" counter.
 */

/** Every registration this Google account hosts (the rules let a host list only their own). */
export async function listMyRegistrations(hostUid: string): Promise<TableAssignment[]> {
	try {
		const snap = await getDocs(
			query(collection(db, Collections.tableAssignments), where('hostUid', '==', hostUid)),
		);

		return snap.docs.map((entry) => entry.data() as TableAssignment);
	} catch (error) {
		console.error('[Registration] listing the hosted registrations failed:', error);
		throw error;
	}
}

export interface WatchedRegistration {
	/** The registration being watched; null when none. */
	id: string | null;
	assignment: TableAssignment | null;
	/** How many registered (`tableAssignmentCounters`); null until the counter answers. */
	registered: number | null;
	/** The registration doc answered at least once (assignment null then means "gone"). */
	loaded: boolean;
}

export const watchedRegistration: WatchedRegistration = {
	id: null,
	assignment: null,
	registered: null,
	loaded: false,
};

let stops: Unsubscribe[] = [];

/** Stop watching and forget the registration. */
export function stopRegistrationWatch(): void {
	for (const stop of stops) stop();
	stops = [];
	watchedRegistration.id = null;
	watchedRegistration.assignment = null;
	watchedRegistration.registered = null;
	watchedRegistration.loaded = false;
}

/**
 * Keep exactly one live registration (and its counter) in `watchedRegistration`.
 * Safe to call on every render: the same id is a no-op, null stops the watch.
 */
export function syncRegistrationWatch(registrationId: string | null): void {
	if (watchedRegistration.id === registrationId) return;
	stopRegistrationWatch();
	if (!registrationId) return;
	watchedRegistration.id = registrationId;
	stops = [
		resilientOnSnapshot(
			CLASS_LISTENER_KINDS.registration,
			doc(db, Collections.tableAssignments, registrationId),
			(snap) => {
				watchedRegistration.assignment = snap.exists() ? (snap.data() as TableAssignment) : null;
				watchedRegistration.loaded = true;
				m.redraw();
			},
			(error) => {
				console.error('[Registration] listener error:', { registrationId }, error);
				watchedRegistration.loaded = true;
				m.redraw();
			},
		),
		resilientOnSnapshot(
			CLASS_LISTENER_KINDS.registrationCounter,
			doc(db, Collections.tableAssignmentCounters, registrationId),
			(snap) => {
				watchedRegistration.registered = snap.exists()
					? (snap.data() as TableAssignmentCounter).registered
					: 0;
				m.redraw();
			},
			(error) => {
				console.error('[Registration] counter listener error:', { registrationId }, error);
			},
		),
	];
}
