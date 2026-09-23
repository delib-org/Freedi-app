import type { AgoraTeacherSurface } from '@freedi/shared-types';

export const ACTIVITY_WINDOW_MS = 60_000;
export interface UsageClock {
	at: number;
	activeUntil: number;
	surface: AgoraTeacherSurface | null;
	uid: string | null;
	visible: boolean;
	pendingMs: number;
}
export function usageSurface(route: string): AgoraTeacherSurface | null {
	const path = route.split('?')[0];
	if (path === '/supervise' || path.startsWith('/supervise/')) return 'supervise';
	if (path === '/teach' || path === '/teach/activity') return 'home';
	if (!path.startsWith('/teach/')) return null;
	if (path.startsWith('/teach/screen/')) return 'projector';
	if (path.startsWith('/teach/session/')) return 'session';
	if (path.startsWith('/teach/class/')) return 'class';
	if (path.startsWith('/teach/report/')) return 'report';
	if (path === '/teach/start') return 'start';
	if (path === '/teach/new' || path.startsWith('/teach/topic/')) return 'topic';

	return null;
}
export function sampleUsage(prev: UsageClock, now: number): UsageClock {
	const credit =
		prev.visible && prev.uid && prev.surface
			? Math.max(0, Math.min(now, prev.activeUntil) - prev.at)
			: 0;

	return { ...prev, at: now, pendingMs: prev.pendingMs + credit };
}
