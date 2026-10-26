import { DEFAULT_SPEAK_SECONDS } from '@freedi/shared-types';

/**
 * Pure countdown maths (no Firebase import, so it tests in plain vitest).
 * Test-only: `VITE_CLASS_CLOCK_SPEED` (default 1) speeds up the DISPLAY of a
 * countdown (an e2e minute passes in 60/speed seconds). It only scales what
 * `remainingMs` returns; nothing is written to the server with it.
 */

const MS_PER_SECOND = 1000;

function readSpeed(): number {
	const raw = (import.meta.env as Record<string, string | undefined>).VITE_CLASS_CLOCK_SPEED;
	const parsed = raw ? Number(raw) : NaN;

	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Display speed factor (1 in production). */
export const CLOCK_SPEED = readSpeed();

export interface RemainingOptions {
	/** Length of the whole interval; only used when speed != 1. Default DEFAULT_SPEAK_SECONDS. */
	totalMs?: number;
	/** Display speed factor. Default CLOCK_SPEED. */
	speed?: number;
}

/**
 * Milliseconds left until `endsAt` (server epoch ms), never negative.
 * `now` is the local `Date.now()`, `offset` from `getServerOffset()`.
 * With speed s > 1 the display runs s times faster, anchored at the start of
 * the interval: shown = total - (total - real) * s.
 */
export function remainingMs(
	endsAt: number,
	now: number,
	offset: number,
	options: RemainingOptions = {},
): number {
	const speed = options.speed ?? CLOCK_SPEED;
	const real = endsAt - (now + offset);
	if (speed === 1) return Math.max(0, real);
	const total = options.totalMs ?? DEFAULT_SPEAK_SECONDS * MS_PER_SECOND;
	const elapsed = Math.min(total, Math.max(0, total - real));

	return Math.max(0, total - elapsed * speed);
}
