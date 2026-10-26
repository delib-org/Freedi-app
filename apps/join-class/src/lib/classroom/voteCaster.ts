/**
 * Pick = vote. The student's taps are written one at a time, in order, and
 * only the LATEST pick matters: while a write is in flight further picks just
 * move `wanted`, and the loop then writes the final one. A write that fails
 * stops the loop (the screen shows the retry); `retry()` writes `wanted` again.
 */

export interface VoteCasterOptions {
	/** Writes one vote (the existing castVote). Rejects on failure. */
	write: (optionId: string) => Promise<void>;
	/** Called whenever the state changed (the screen redraws). */
	onChange: () => void;
	/** Called with the error of a failed write. */
	onError: (error: unknown) => void;
	/** False when the picked card cannot be voted for now (hidden, paused, closed): do not re-send it. */
	canCast: (optionId: string) => boolean;
}

export class VoteCaster {
	/** The latest card the student picked (null = nothing picked yet). */
	wanted: string | null = null;
	/** The vote the server is known to hold for this student. */
	written: string | null = null;
	busy = false;
	failed = false;
	private readonly options: VoteCasterOptions;

	constructor(options: VoteCasterOptions) {
		this.options = options;
	}

	/** True while the screen should keep the card order still. */
	get pending(): boolean {
		return this.wanted !== null && this.wanted !== this.written;
	}

	/** The vote the server reports (the listener). Ignored mid-write so an echo cannot undo a pick. */
	sync(votedId: string | null): void {
		if (this.busy) return;
		this.written = votedId;
		if (this.failed) return;
		// A stale echo of an older vote must not strand a newer pick: write it again.
		if (this.wanted !== null && this.wanted !== votedId && this.options.canCast(this.wanted))
			void this.drain();
		else this.wanted = votedId;
	}

	pick(optionId: string): void {
		this.wanted = optionId;
		this.failed = false;
		this.options.onChange();
		void this.drain();
	}

	retry(): void {
		this.failed = false;
		this.options.onChange();
		void this.drain();
	}

	private async drain(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			while (this.wanted !== null && this.wanted !== this.written && !this.failed) {
				const optionId = this.wanted;
				this.options.onChange();
				try {
					await this.options.write(optionId);
					this.written = optionId;
				} catch (error) {
					this.failed = true;
					this.options.onError(error);
				}
			}
		} finally {
			this.busy = false;
			this.options.onChange();
		}
	}
}
