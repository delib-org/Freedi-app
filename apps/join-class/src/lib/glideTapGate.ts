/**
 * Taps during a FLIP glide (IA 21.3): the cards are sliding, so a tap is not
 * acted on at once (a card could land under a finger that aimed at another).
 * It is not lost either: the gate remembers the latest tap, by option id and
 * never by screen position, and delivers it the moment the glide ends. A
 * later tap replaces an earlier remembered one. `cancel` drops it (voting
 * closed, screen gone), and `deliver` may refuse it if the id is no longer
 * a valid target by then.
 */

export type TapOutcome = 'sent' | 'queued';

export interface GlideTapGate {
	/** A glide of this many ms starts now (a longer running glide is kept). */
	startGlide: (durationMs: number) => void;
	isGliding: () => boolean;
	/** Send the tap now, or remember it until the glide ends. */
	tap: (id: string) => TapOutcome;
	/** Forget the remembered tap and its timer. */
	cancel: () => void;
	/** The remembered tap's id, if any. */
	pendingId: () => string | null;
}

export interface GlideTapGateOptions {
	/** Sends the tap. It decides for itself whether the id is still valid. */
	deliver: (id: string) => void;
	now?: () => number;
}

export function createGlideTapGate(options: GlideTapGateOptions): GlideTapGate {
	const now = options.now ?? Date.now;
	let glideEnd = 0;
	let pending: string | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const isGliding = (): boolean => now() < glideEnd;

	function clearTimer(): void {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	}

	function schedule(): void {
		clearTimer();
		timer = setTimeout(flush, Math.max(glideEnd - now(), 0));
	}

	function flush(): void {
		timer = null;
		if (pending === null) return;
		if (isGliding()) {
			schedule();

			return;
		}
		const id = pending;
		pending = null;
		options.deliver(id);
	}

	return {
		startGlide(durationMs) {
			glideEnd = Math.max(glideEnd, now() + durationMs);
			if (pending !== null) schedule();
		},
		isGliding,
		tap(id) {
			if (!isGliding()) {
				options.deliver(id);

				return 'sent';
			}
			pending = id;
			schedule();

			return 'queued';
		},
		cancel() {
			pending = null;
			clearTimer();
		},
		pendingId: () => pending,
	};
}
