import m from 'mithril';
import { AGORA_TEACHER_USAGE } from '@freedi/shared-types';
import { teacherHeartbeat } from './callables';
import { getUserState } from './user';
import { ACTIVITY_WINDOW_MS, sampleUsage, usageSurface, type UsageClock } from './flows/usageClock';

/** How often the clock is read when nothing is happening */
export const SAMPLE_MS = 15_000;

let running: (() => void) | null = null;

/**
 * Counts a signed-in teacher's active time on the teacher and supervisor
 * screens and reports it in beats.
 *
 * Only elapsed milliseconds and an enumerated surface are ever sent — no
 * URLs, no targets, no input. Time counts while the tab is visible and the
 * teacher touched it within the last minute (`ACTIVITY_WINDOW_MS`); a beat
 * goes out once `HEARTBEAT_INTERVAL_MS` of ACTIVE time has accumulated, or
 * on that much wall time if anything is pending, and the rest is flushed
 * when the surface changes, the page hides, or the clock stops.
 *
 * One clock per page: the surface comes from the route, so views need not
 * mount anything. Calling it twice returns the same stop function.
 */
export function startUsageHeartbeat(): () => void {
	if (running) return running;

	let clock: UsageClock = {
		at: Date.now(),
		activeUntil: 0,
		surface: null,
		uid: null,
		visible: !document.hidden,
		pendingMs: 0,
	};
	let lastSent = Date.now();

	function flush(): void {
		const { pendingMs, surface, uid } = clock;
		clock = { ...clock, pendingMs: 0 };
		lastSent = Date.now();
		if (!surface || !uid || pendingMs <= 0 || uid !== getUserState().user?.uid) return;
		void teacherHeartbeat({ surface, sinceMs: pendingMs }).catch((error: unknown) => {
			console.error('[Usage]', { operation: 'usageHeartbeat.flush', surface, error });
		});
	}

	function tick(interacted = false): void {
		const now = Date.now();
		clock = sampleUsage(clock, now);
		const user = getUserState();
		const uid = user.tier === 2 ? (user.user?.uid ?? null) : null;
		const surface = usageSurface(m.route.get() ?? '');
		if (uid !== clock.uid) {
			// Another account (or none): whatever was pending is not theirs to report
			clock = { ...clock, pendingMs: 0, activeUntil: 0 };
		} else if (surface !== clock.surface || document.hidden) flush();
		clock = {
			...clock,
			uid,
			surface,
			visible: !document.hidden,
			activeUntil:
				interacted && !document.hidden && uid && surface
					? now + ACTIVITY_WINDOW_MS
					: clock.activeUntil,
		};
		if (!surface || document.hidden) clock.activeUntil = 0;
		if (
			clock.pendingMs >= AGORA_TEACHER_USAGE.HEARTBEAT_INTERVAL_MS ||
			now - lastSent >= AGORA_TEACHER_USAGE.HEARTBEAT_INTERVAL_MS
		)
			flush();
	}

	const interact = (): void => tick(true);
	const visibility = (): void => tick();
	const hide = (): void => {
		tick();
		flush();
	};
	const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
	events.forEach((event) => window.addEventListener(event, interact, { passive: true }));
	window.addEventListener('hashchange', visibility);
	document.addEventListener('visibilitychange', visibility);
	window.addEventListener('pagehide', hide);
	const timer = window.setInterval(() => tick(), SAMPLE_MS);

	running = () => {
		tick();
		flush();
		window.clearInterval(timer);
		events.forEach((event) => window.removeEventListener(event, interact));
		window.removeEventListener('hashchange', visibility);
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('pagehide', hide);
		running = null;
	};

	return running;
}

/** Flush what is pending and stop sampling. Safe to call when nothing runs. */
export function stopUsageHeartbeat(): void {
	running?.();
}
