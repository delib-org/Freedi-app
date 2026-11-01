import m from 'mithril';
import type { StatementSubscription } from '@freedi/shared-types';
import { listenRoster } from '@/lib/classroom/listeners';

/**
 * A student screen's own view of the roster (who joined, their names and sides).
 * `watchClass` keeps the roster for teachers only, so the student screens that
 * need it (waiting count, table-mates) hold a small watcher of their own.
 * `statementsSubscribe` is readable by any signed-in user (see listeners.ts).
 */
export interface RosterWatch {
	/** Latest roster; empty until the first delivery or when reading is refused. */
	readonly subs: readonly StatementSubscription[];
	/** True once the first snapshot (or an error) arrived. */
	readonly ready: boolean;
	stop(): void;
}

export function watchRoster(mainId: string): RosterWatch {
	const watch = { subs: [] as readonly StatementSubscription[], ready: false };
	const unsubscribe = listenRoster(
		mainId,
		(subs) => {
			watch.subs = subs;
			watch.ready = true;
			m.redraw();
		},
		(error) => {
			console.error('[Classroom] student roster listener error:', error);
			watch.ready = true;
			m.redraw();
		},
	);

	return {
		get subs() {
			return watch.subs;
		},
		get ready() {
			return watch.ready;
		},
		stop: unsubscribe,
	};
}
