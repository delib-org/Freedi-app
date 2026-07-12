import m from 'mithril';

export interface CelebrationPayload {
	/** Main celebratory line, already translated */
	message: string;
	/** The improvement itself, quoted in the popup */
	detail?: string;
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
