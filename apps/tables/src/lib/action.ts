import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { errorMessageKey } from '@/logic/callableErrors';

/**
 * One user action that calls the server: tracks `busy`, the last failure's
 * message key and the success flag, logs failures with context, and redraws.
 * A screen holds one per button so a failure shows next to the thing it
 * belongs to.
 */
export class Action {
	busy = false;
	errorKey: string | null = null;
	succeeded = false;

	constructor(
		private readonly operation: string,
		/** Message key for `failed-precondition` (stale draft, full table, ...). */
		private readonly preconditionKey: string = 'tableAssignment.error.generic',
		/** Message keys for server reasons that mean something else on this screen. */
		private readonly reasonKeys: Readonly<Record<string, string>> = {},
	) {}

	/** Run `work`; resolves to its result, or undefined when it failed (see `errorKey`). */
	async run<T>(work: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T | undefined> {
		this.busy = true;
		this.errorKey = null;
		this.succeeded = false;
		m.redraw();

		try {
			const result = await work();

			this.succeeded = true;

			return result;
		} catch (error) {
			logError(error, { operation: this.operation, metadata });
			this.errorKey = errorMessageKey(error, this.preconditionKey, this.reasonKeys);

			return undefined;
		} finally {
			this.busy = false;
			m.redraw();
		}
	}

	clear(): void {
		this.errorKey = null;
		this.succeeded = false;
	}
}
