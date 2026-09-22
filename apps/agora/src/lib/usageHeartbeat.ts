import m from 'mithril';
import {
	AGORA_TEACHER_USAGE,
	type TeacherHeartbeatRequest,
	type TeacherHeartbeatResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from './firebase';
import { getUserState } from './user';
import { ACTIVITY_WINDOW_MS, sampleUsage, usageSurface, type UsageClock } from './flows/usageClock';

const SAMPLE_MS = 15000;
/** Records elapsed activity only. Event targets, URLs and input contents are never sent. */
export function startUsageHeartbeat(): () => void {
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
		void httpsCallable<TeacherHeartbeatRequest, TeacherHeartbeatResponse>(
			functions,
			'agoraTeacherHeartbeat',
		)({ surface, sinceMs: pendingMs }).catch((error: unknown) => {
			console.error('[Usage]', { operation: 'teacherHeartbeat', error });
		});
	}
	function tick(interacted = false): void {
		const now = Date.now();
		clock = sampleUsage(clock, now);
		const user = getUserState();
		const uid = user.tier === 2 ? (user.user?.uid ?? null) : null;
		const surface = usageSurface(m.route.get() ?? '');
		if (uid !== clock.uid) {
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
		if (now - lastSent >= AGORA_TEACHER_USAGE.HEARTBEAT_INTERVAL_MS) flush();
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

	return () => {
		window.clearInterval(timer);
		events.forEach((event) => window.removeEventListener(event, interact));
		window.removeEventListener('hashchange', visibility);
		document.removeEventListener('visibilitychange', visibility);
		window.removeEventListener('pagehide', hide);
	};
}
