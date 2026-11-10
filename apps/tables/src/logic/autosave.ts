/**
 * Autosave with an honest state: "saved" is only ever reported after the
 * server confirmed. One save per kind runs at a time, the newest value wins,
 * a failure keeps the value marked unsaved and is retried, and `flush` lets a
 * screen wait for everything before it moves on.
 */

/** `blocked`: nothing was sent, because the input cannot be saved yet. */
export type SaveOutcome = 'saved' | 'blocked';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'blocked';

export interface AutosaveOptions {
	debounceMs: number;
	retryDelayMs: number;
	maxAutoRetries: number;
}

interface Slot {
	status: AutosaveState;
	dirty: boolean;
	retries: number;
	timer: ReturnType<typeof setTimeout> | null;
	inFlight: Promise<void> | null;
}

const DEFAULT_OPTIONS: AutosaveOptions = {
	debounceMs: 700,
	retryDelayMs: 4_000,
	maxAutoRetries: 3,
};

/** Worst first: a failure outranks everything the mark could otherwise say. */
const STATE_ORDER: readonly AutosaveState[] = ['failed', 'saving', 'blocked', 'saved', 'idle'];

function isFailed(slot: Slot): boolean {
	return slot.status === 'failed';
}

export class Autosaver<Kind extends string> {
	private readonly slots = new Map<Kind, Slot>();

	constructor(
		private readonly work: Readonly<Record<Kind, () => Promise<SaveOutcome>>>,
		private readonly onChange: () => void = () => undefined,
		private readonly onError: (kind: Kind, error: unknown) => void = () => undefined,
		private readonly options: AutosaveOptions = DEFAULT_OPTIONS,
	) {
		for (const kind of Object.keys(work) as Kind[]) {
			this.slots.set(kind, {
				status: 'idle',
				dirty: false,
				retries: 0,
				timer: null,
				inFlight: null,
			});
		}
	}

	get state(): AutosaveState {
		const states = [...this.slots.values()].map((slot) => slot.status);

		return STATE_ORDER.find((state) => states.includes(state)) ?? 'idle';
	}

	/** Anything typed that the server has not confirmed yet. */
	get hasUnsaved(): boolean {
		return [...this.slots.values()].some((slot) => slot.dirty || slot.inFlight !== null);
	}

	/** A value of this kind changed: save it once the typing pauses. */
	touch(kind: Kind): void {
		const slot = this.slot(kind);

		slot.dirty = true;
		slot.retries = 0;
		slot.status = 'saving';
		this.clearTimer(slot);
		slot.timer = setTimeout(() => this.fire(kind), this.options.debounceMs);
		this.onChange();
	}

	/** Send everything now and wait; true when nothing is left unsaved. */
	async flush(): Promise<boolean> {
		const kinds = [...this.slots.keys()];

		await Promise.all(kinds.map((kind) => this.settle(kind)));

		return [...this.slots.values()].every((slot) => !slot.dirty && slot.status !== 'failed');
	}

	/** The host asked to try again. */
	retry(): void {
		for (const [kind, slot] of this.slots) {
			if (slot.status === 'failed') {
				slot.retries = 0;
				this.fire(kind);
			}
		}
	}

	private slot(kind: Kind): Slot {
		const slot = this.slots.get(kind);

		if (!slot) throw new Error(`Unknown autosave kind: ${kind}`);

		return slot;
	}

	private clearTimer(slot: Slot): void {
		if (slot.timer !== null) clearTimeout(slot.timer);
		slot.timer = null;
	}

	private fire(kind: Kind): void {
		const slot = this.slot(kind);

		this.clearTimer(slot);
		if (slot.dirty) void this.run(kind);
	}

	private run(kind: Kind): Promise<void> {
		const slot = this.slot(kind);

		slot.inFlight ??= this.attempt(kind, slot).finally(() => {
			slot.inFlight = null;
			this.afterAttempt(kind, slot);
		});

		return slot.inFlight;
	}

	private async attempt(kind: Kind, slot: Slot): Promise<void> {
		slot.dirty = false;
		slot.status = 'saving';
		this.onChange();

		try {
			slot.status = await this.work[kind]();
			slot.retries = 0;
		} catch (error) {
			slot.dirty = true;
			slot.status = 'failed';
			this.onError(kind, error);
		}
	}

	private afterAttempt(kind: Kind, slot: Slot): void {
		if (slot.status === 'failed') {
			if (slot.retries < this.options.maxAutoRetries) {
				slot.retries += 1;
				slot.timer = setTimeout(() => this.fire(kind), this.options.retryDelayMs);
			}
		} else if (slot.dirty) {
			// A newer value arrived while this one was on its way.
			slot.status = 'saving';
			if (slot.timer === null) void this.run(kind);
		}
		this.onChange();
	}

	private async settle(kind: Kind): Promise<void> {
		const slot = this.slot(kind);

		this.clearTimer(slot);
		if (slot.status === 'failed') slot.status = 'saving';

		for (;;) {
			if (slot.inFlight) {
				await slot.inFlight;
				this.clearTimer(slot);
			} else if (slot.dirty && !isFailed(slot)) {
				await this.run(kind);
				this.clearTimer(slot);
			} else {
				return;
			}
		}
	}
}
