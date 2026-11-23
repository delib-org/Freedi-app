import m from 'mithril';
import { listenMates } from '@/lib/classroom/c3Data';
import { isPermissionDenied } from '@/lib/classroom/classState';
import type { RosterSubscription } from '@/lib/classroom/rosterPrivacy';
import { captureException } from '@/lib/sentry';

/**
 * A student screen's view of the people at their own table (names for the
 * table chips; never anyone's side, those are private).
 * A phone may read only its own table's subscriptions (Trello sN881XCU): the
 * lesson-wide roster is the teacher's. The class size comes from the lesson
 * (studentCountOf), not from here.
 * `sync(tableId)` follows the student's seat: a move re-listens to the new table.
 */
export interface TableRosterWatch {
	/** Latest subscriptions of the table; empty until the first delivery, with no seat, or when refused. */
	readonly subs: readonly RosterSubscription[];
	/** True once the first snapshot (or an error) arrived for the current table. */
	readonly ready: boolean;
	sync(tableId: string | undefined): void;
	stop(): void;
}

export function watchTableRoster(mainId: string): TableRosterWatch {
	const watch = {
		subs: [] as readonly RosterSubscription[],
		ready: false,
		tableId: undefined as string | undefined,
		unsubscribe: null as (() => void) | null,
	};
	const stop = (): void => {
		watch.unsubscribe?.();
		watch.unsubscribe = null;
	};

	return {
		get subs() {
			return watch.subs;
		},
		get ready() {
			return watch.ready;
		},
		sync(tableId) {
			if (tableId === watch.tableId) return;
			stop();
			watch.tableId = tableId;
			watch.subs = [];
			watch.ready = false;
			if (!tableId) return;
			watch.unsubscribe = listenMates(
				mainId,
				tableId,
				(subs) => {
					watch.subs = subs;
					watch.ready = true;
					m.redraw();
				},
				(error) => {
					// A moved student loses the old table a moment before their subscription
					// names the new one (the same race as the table doc, classState.ts): the
					// chips fall back to "unnamed" until sync() moves the listener.
					if (isPermissionDenied(error)) {
						console.info('[Classroom] table roster closed to me (moved?)', { tableId });
					} else {
						captureException(error, {
							operation: 'classroom.watchTableRoster',
							mainId,
							metadata: { tableId },
						});
					}
					watch.ready = true;
					m.redraw();
				},
			);
		},
		stop,
	};
}
