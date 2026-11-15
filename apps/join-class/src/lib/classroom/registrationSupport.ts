import m from 'mithril';
import type { ClassRegistrationSupportResponse } from '@freedi/shared-types';
import type { LessonSettingsHolder } from '@freedi/shared-types';
import { classRegistrationSupport } from './api';
import { registrationAskedPosition } from './registrationLogic';
import type { SideNames } from './classSettings';

/**
 * "Support by side" of a lesson whose registration asked a position (IA
 * tables-class-bridge 2.5). The positions are private to the registration, so the
 * totals come from the server (`classRegistrationSupport`), with the registration's
 * two poles as the names; no Class screen ever holds a person's position.
 * The teacher always gets it; a student only when the challenge shows support to
 * everyone (the server refuses otherwise, and the screen asks only then).
 */

/** How long a fetched answer is trusted before the next render asks again. */
export const SUPPORT_REFRESH_MS = 10_000;

export interface RegistrationSupportState {
	mainId: string | null;
	data: ClassRegistrationSupportResponse | null;
	loading: boolean;
	failed: boolean;
	fetchedAt: number;
}

export const registrationSupport: RegistrationSupportState = {
	mainId: null,
	data: null,
	loading: false,
	failed: false,
	fetchedAt: 0,
};

export function resetRegistrationSupport(): void {
	registrationSupport.mainId = null;
	registrationSupport.data = null;
	registrationSupport.loading = false;
	registrationSupport.failed = false;
	registrationSupport.fetchedAt = 0;
}

/** What a support screen shows for this lesson. */
export type SupportView =
	/** No position was asked: the lesson's own Side step and roster are the source. */
	| { kind: 'own' }
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'ready'; result: ClassRegistrationSupportResponse['support']; names: SideNames };

export function supportViewOf(
	main: LessonSettingsHolder | null | undefined,
	state: RegistrationSupportState,
	mainId: string,
): SupportView {
	if (!registrationAskedPosition(main)) return { kind: 'own' };
	if (state.mainId !== mainId || !state.data) {
		return state.failed && state.mainId === mainId ? { kind: 'failed' } : { kind: 'loading' };
	}

	return {
		kind: 'ready',
		result: state.data.support,
		names: { a: state.data.poleA, b: state.data.poleB },
	};
}

/** Is a new fetch due: nothing in flight, and the answer is missing or stale. */
export function fetchIsDue(state: RegistrationSupportState, mainId: string, now: number): boolean {
	if (state.loading) return false;
	if (state.mainId !== mainId) return true;

	return now - state.fetchedAt >= SUPPORT_REFRESH_MS;
}

/** Ask the server for the totals when due. Safe to call on every render. */
export function refreshRegistrationSupport(mainId: string, force = false): void {
	if (!force && !fetchIsDue(registrationSupport, mainId, Date.now())) return;
	if (registrationSupport.mainId !== mainId) resetRegistrationSupport();
	registrationSupport.mainId = mainId;
	registrationSupport.loading = true;
	registrationSupport.failed = false;
	classRegistrationSupport({ mainId })
		.then((response) => {
			if (registrationSupport.mainId !== mainId) return;
			registrationSupport.data = response;
		})
		.catch((error: unknown) => {
			console.error('[RegistrationSupport] failed:', { mainId }, error);
			if (registrationSupport.mainId === mainId) registrationSupport.failed = true;
		})
		.finally(() => {
			registrationSupport.loading = false;
			registrationSupport.fetchedAt = Date.now();
			m.redraw();
		});
}

/**
 * The view for `mainId`, asking the server first when due and the registration
 * asked a position. `allowed` false (a student who may not see it) never asks.
 */
export function supportForScreen(
	main: LessonSettingsHolder | null | undefined,
	mainId: string,
	allowed = true,
): SupportView {
	if (allowed && registrationAskedPosition(main)) refreshRegistrationSupport(mainId);

	return supportViewOf(main, registrationSupport, mainId);
}
