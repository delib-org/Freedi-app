/**
 * What a tap on the ballot does, before and regardless of the network.
 *
 * The ballot used to wait for Firestore: a tap disabled every option until the
 * server acknowledged the write, and the student's choice was painted only when
 * a snapshot echoed it back. On a phone on a crowded classroom AP (an iPhone on
 * Safari in the report) that reads as "I tapped and nothing happened" — and
 * then, much later, the vote "suddenly goes in". Worse, a student who taps again
 * because nothing happened was either ignored (buttons disabled) or, once the
 * echo arrived, WITHDREW the vote they had just cast (tapping your own vote is
 * the withdrawal gesture).
 *
 * This sender owns the gesture instead:
 *  - the choice is shown the instant the finger lifts (`displayed`), marked as
 *    still saving until the server has it;
 *  - one write at a time — taps while one is in the air only move the intent,
 *    and the latest intent is sent when the current write settles, so the last
 *    tap wins and nothing is double-submitted;
 *  - a second tap on the same option within `REPEAT_TAP_MS` is the same tap
 *    (an impatient double tap), not a withdrawal;
 *  - a failed write puts the ballot back on what the server holds and keeps the
 *    failed choice for a one-tap retry.
 *
 * Pure apart from the injected `send` and `onChange`, so it is unit-tested.
 */

/** A second tap on the same option inside this window is the same tap. */
export const REPEAT_TAP_MS = 700;

/** `null` = withdraw (no vote); a string = vote for that option. */
export type BallotChoice = string | null;

export interface BallotSenderDeps {
	/** Writes the choice. Resolves once the server has it, rejects if it failed. */
	send: (choice: BallotChoice) => Promise<void>;
	/** Called on every state change, so the view can redraw. */
	onChange?: () => void;
	/** Called once per failed write, for logging. */
	onError?: (error: unknown, choice: BallotChoice) => void;
	now?: () => number;
}

export interface BallotSender {
	/** A tap on an option. `confirmed` is the vote the server currently holds. */
	tap(statementId: string, confirmed: BallotChoice): void;
	/** Send the choice that failed last, again. */
	retry(): void;
	/** The vote to paint: the student's latest intent, else the confirmed one. */
	displayed(confirmed: BallotChoice): BallotChoice;
	/** True while the painted choice is not yet on the server. */
	isSaving(): boolean;
	/** The last write failed (and nothing newer has been tapped since). */
	hasFailed(): boolean;
}

export function createBallotSender(deps: BallotSenderDeps): BallotSender {
	const now = deps.now ?? Date.now;
	/** What the student wants; `undefined` = nothing beyond what the server holds. */
	let intent: BallotChoice | undefined = undefined;
	/** The choice currently being written, if any. */
	let inFlight: BallotChoice | undefined = undefined;
	let failedChoice: BallotChoice | undefined = undefined;
	let lastTap: { id: string; at: number } | null = null;

	const changed = (): void => deps.onChange?.();

	function pump(): void {
		if (inFlight !== undefined || intent === undefined) return;
		const choice = intent;
		inFlight = choice;
		deps
			.send(choice)
			.then(() => {
				inFlight = undefined;
				// Nothing newer was tapped while this was in the air: the server now
				// holds exactly the intent, and the snapshot carries it from here.
				if (intent === choice) intent = undefined;
			})
			.catch((error: unknown) => {
				inFlight = undefined;
				deps.onError?.(error, choice);
				if (intent === choice) {
					intent = undefined;
					failedChoice = choice;
				}
			})
			.finally(() => {
				pump();
				changed();
			});
	}

	function setIntent(choice: BallotChoice): void {
		failedChoice = undefined;
		intent = choice;
		pump();
		changed();
	}

	return {
		tap(statementId, confirmed) {
			const at = now();
			const repeat =
				lastTap !== null && lastTap.id === statementId && at - lastTap.at < REPEAT_TAP_MS;
			lastTap = { id: statementId, at };
			if (repeat) return;

			const shown = intent !== undefined ? intent : confirmed;
			setIntent(shown === statementId ? null : statementId);
		},
		retry() {
			if (failedChoice === undefined) return;
			setIntent(failedChoice);
		},
		displayed(confirmed) {
			return intent !== undefined ? intent : confirmed;
		},
		isSaving() {
			return intent !== undefined || inFlight !== undefined;
		},
		hasFailed() {
			return failedChoice !== undefined;
		},
	};
}
