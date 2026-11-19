/**
 * An optimistic overlay: what the screen should show NOW, laid over the data the
 * server last sent. The server stays the source of truth; the overlay is only a
 * guess that is thrown away as soon as the server speaks (or fails to).
 *
 * A change lives from `track` until the first of:
 *   - a snapshot confirms it (`reconcile` sees `isConfirmedBy` true),
 *   - its call fails (dropped at once: the screen goes back to the server's data),
 *   - its call succeeded and the snapshot did not show it within OPTIMISTIC_SETTLE_MS
 *     (the server answered otherwise: the server wins),
 *   - the call never answered within OPTIMISTIC_CALL_TIMEOUT_MS.
 * Nothing here writes anywhere; it only changes what `view` returns.
 */

/** A call that never answers stops guessing after this long. */
export const OPTIMISTIC_CALL_TIMEOUT_MS = 10_000;
/** After the call said "ok", the snapshot with the write is given this long to arrive. */
export const OPTIMISTIC_SETTLE_MS = 2_000;

export interface OptimisticChange<T> {
	/** The expected data once the server has done it. Must not mutate `base`. */
	apply: (base: T) => T;
	/** True when the server's own data already shows the change. */
	isConfirmedBy: (base: T) => boolean;
}

interface Pending<T> {
	id: number;
	change: OptimisticChange<T>;
	timer: ReturnType<typeof setTimeout> | null;
}

export class OptimisticOverlay<T> {
	private pending: Pending<T>[] = [];
	private nextId = 1;
	private readonly onChange: () => void;
	private readonly onError: (error: unknown) => void;

	/** `onChange`: the overlay changed on its own (a timer or a call); the owner recomputes and redraws. */
	constructor(onChange: () => void, onError: (error: unknown) => void = () => undefined) {
		this.onChange = onChange;
		this.onError = onError;
	}

	get size(): number {
		return this.pending.length;
	}

	/** `base` with every pending change applied, oldest first. A change that throws is dropped. */
	view(base: T): T {
		let shown = base;
		for (const entry of [...this.pending]) {
			try {
				shown = entry.change.apply(shown);
			} catch (error) {
				this.onError(error);
				this.remove(entry.id);
			}
		}

		return shown;
	}

	/** A server snapshot arrived: forget every change it already shows. Does not call `onChange`. */
	reconcile(base: T): void {
		for (const entry of [...this.pending]) {
			let confirmed = false;
			try {
				confirmed = entry.change.isConfirmedBy(base);
			} catch (error) {
				this.onError(error);
				confirmed = true;
			}
			if (confirmed) this.remove(entry.id);
		}
	}

	/** Show `change` now, run `call`, and settle the change by how the call goes. */
	async track<R>(change: OptimisticChange<T>, call: () => Promise<R>): Promise<R> {
		const id = this.add(change);
		try {
			const result = await call();
			this.callSucceeded(id);

			return result;
		} catch (error) {
			this.drop(id);
			throw error;
		}
	}

	/** Forget everything (the class state is reset). */
	clear(): void {
		for (const entry of this.pending) this.stopTimer(entry);
		this.pending = [];
	}

	private add(change: OptimisticChange<T>): number {
		const id = this.nextId++;
		const entry: Pending<T> = { id, change, timer: null };
		entry.timer = setTimeout(() => this.drop(id), OPTIMISTIC_CALL_TIMEOUT_MS);
		this.pending.push(entry);
		this.onChange();

		return id;
	}

	private callSucceeded(id: number): void {
		const entry = this.pending.find((p) => p.id === id);
		if (!entry) return;
		this.stopTimer(entry);
		entry.timer = setTimeout(() => this.drop(id), OPTIMISTIC_SETTLE_MS);
	}

	private drop(id: number): void {
		if (this.remove(id)) this.onChange();
	}

	private remove(id: number): boolean {
		const at = this.pending.findIndex((p) => p.id === id);
		if (at < 0) return false;
		this.stopTimer(this.pending[at]);
		this.pending.splice(at, 1);

		return true;
	}

	private stopTimer(entry: Pending<T>): void {
		if (entry.timer) clearTimeout(entry.timer);
		entry.timer = null;
	}
}
