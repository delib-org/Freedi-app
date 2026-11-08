import m from 'mithril';
import type { Unsubscribe } from 'firebase/firestore';
import { logError } from '@freedi/shared-utils';
import type { Subscription } from '@/lib/tableAssignment/data';
import { stateForErrorCode } from '@/logic/loadable';
import type { LoadState } from '@/logic/loadable';

/**
 * One live value: a Firestore subscription plus its load state. Screens hold
 * one per collection, start them in oninit, stop them in onremove, and read
 * `state` / `data` in the view. `retry()` restarts after an error.
 */
export class LiveValue<T> {
	state: LoadState = 'loading';
	data: T | undefined;

	private unsubscribe: Unsubscribe | null = null;

	constructor(
		private readonly name: string,
		private readonly subscription: Subscription<T>,
	) {}

	start(): void {
		this.stop();
		this.state = 'loading';
		this.unsubscribe = this.subscription(
			(data) => {
				this.data = data;
				this.state = 'ready';
				m.redraw();
			},
			(error) => {
				logError(error, {
					operation: `tables.live.${this.name}`,
					metadata: { code: error.code },
				});
				this.state = stateForErrorCode(error.code);
				m.redraw();
			},
		);
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	retry(): void {
		this.start();
	}
}
