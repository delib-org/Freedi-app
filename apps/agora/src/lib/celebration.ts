import m from 'mithril';

export interface CelebrationPayload {
	/** Main celebratory line, already translated */
	message: string;
	/** The improvement itself, quoted in the popup */
	detail?: string;
	/**
	 * Optional continuation: the celebration is a fork in the loop, not a
	 * dead end. Runs on click, then the popup dismisses itself.
	 */
	action?: { label: string; run: () => void };
}

let current: CelebrationPayload | null = null;

export function getCelebration(): CelebrationPayload | null {
	return current;
}

/** Fire the glitter popup — one at a time, latest wins */
export function celebrate(payload: CelebrationPayload): void {
	current = payload;
	m.redraw();
}

export function dismissCelebration(): void {
	current = null;
	m.redraw();
}
