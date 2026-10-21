import { getRtdb, rtdbOnValue, rtdbRef } from '../firebase';

/**
 * Server clock for timers. Table timers are server moments (`speakerEndsAt`,
 * epoch ms on the SERVER clock); a phone's own clock can be minutes off, so
 * every countdown is computed as `endsAt - (Date.now() + offset)`.
 *
 * Offset source: Realtime Database `.info/serverTimeOffset` (exact, free, one
 * subscription that is dropped after the first value). Join already uses RTDB
 * for liveDrafts, so it is normally available. Without RTDB we fall back to the
 * HTTP `Date` header of our own origin (1 s resolution, midpoint-corrected);
 * on any failure the offset stays 0.
 *
 * `remainingMs(endsAt, now, offset)` and the test-only display speed factor
 * (`VITE_CLASS_CLOCK_SPEED`, default 1) live in clockMath.ts and are re-exported.
 */

export { remainingMs, CLOCK_SPEED } from './clockMath';
export type { RemainingOptions } from './clockMath';

const HEADER_PROBE_ROUNDS = 1;
const MS_PER_SECOND = 1000;

let offsetMs = 0;
let initStarted = false;

/** Estimated `serverTime - localTime`, in ms. */
export function getServerOffset(): number {
	return offsetMs;
}

/** Test helper / manual override. */
export function setServerOffset(value: number): void {
	offsetMs = value;
}

/** Server "now" in epoch ms. */
export function serverNow(): number {
	return Date.now() + offsetMs;
}

async function offsetFromDateHeader(): Promise<number | null> {
	try {
		for (let i = 0; i < HEADER_PROBE_ROUNDS; i++) {
			const t0 = Date.now();
			const res = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
			const t1 = Date.now();
			const header = res.headers.get('date');
			const server = header ? Date.parse(header) : NaN;
			if (Number.isFinite(server)) {
				// the header is truncated to the second: assume the middle of it
				return server + MS_PER_SECOND / 2 - (t0 + t1) / 2;
			}
		}
	} catch (error) {
		console.error('[Classroom] clock header probe failed:', error);
	}

	return null;
}

/** Estimate the offset once per page load. Safe to call repeatedly. */
export function initServerClock(): Promise<number> {
	if (initStarted) return Promise.resolve(offsetMs);
	initStarted = true;

	return new Promise<number>((resolve) => {
		const rtdb = getRtdb();
		if (!rtdb) {
			void offsetFromDateHeader().then((value) => {
				if (value !== null) offsetMs = value;
				resolve(offsetMs);
			});

			return;
		}
		try {
			const stop = rtdbOnValue(
				rtdbRef(rtdb, '.info/serverTimeOffset'),
				(snap) => {
					const value = snap.val();
					if (typeof value === 'number') offsetMs = value;
					stop();
					resolve(offsetMs);
				},
				(error) => {
					console.error('[Classroom] serverTimeOffset failed:', error);
					resolve(offsetMs);
				},
			);
		} catch (error) {
			console.error('[Classroom] serverTimeOffset subscribe failed:', error);
			resolve(offsetMs);
		}
	});
}
