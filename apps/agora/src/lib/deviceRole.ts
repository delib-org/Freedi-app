import type { DeviceRole } from './flows/deviceRole';

/**
 * The role this device answered with — per browser, never per lesson: a
 * laptop on the wall is a property of the laptop. The decision itself is
 * `lib/flows/deviceRole.ts`; this is only where the answer is kept.
 */
const ROLE_KEY = 'agora.teacher.device';
let sessionRole: DeviceRole | null = null;

export function getDeviceRole(): DeviceRole | null {
	if (sessionRole) return sessionRole;
	try {
		const stored = localStorage.getItem(ROLE_KEY);

		return stored === 'private' || stored === 'wall' ? stored : null;
	} catch {
		return null;
	}
}

export function setDeviceRole(role: DeviceRole): void {
	try {
		localStorage.setItem(ROLE_KEY, role);
		sessionRole = null;
	} catch {
		// Private/blocked storage: the answer holds for this sitting
		sessionRole = role;
	}
}
