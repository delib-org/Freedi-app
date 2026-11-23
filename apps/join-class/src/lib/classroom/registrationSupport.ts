import m from 'mithril';
import type { ShownSupportBySide } from '@freedi/shared-types';
import type { LessonSettingsHolder } from '@freedi/shared-types';
import { classRegistrationSupport, classSupportBySide } from './api';
import { registrationAskedPosition } from './registrationLogic';
import { captureException } from '../sentry';
import type { SideNames } from './classSettings';

/**
 * "Support by side", always from the server (no Class screen ever holds a
 * person's side, Trello btMVQMM5):
 *  - a lesson whose registration asked a position (IA tables-class-bridge 2.5):
 *    `classRegistrationSupport`, with the registration's two poles as the names;
 *  - every other lesson: `classSupportBySide`, totals of the lesson's own Side
 *    step (the sides are private, classSides/{uid}--{mainId}); the screen names
 *    the sides from the lesson (`names` null).
 * The teacher always gets it at Vote / Summary; a student only when the
 * challenge shows support to everyone (the server refuses otherwise, and the
 * screen asks only then).
 */

/** Which callable answers for a lesson. */
export type SupportSource = 'registration' | 'own';

export interface SupportData {
	support: ShownSupportBySide;
	/** The registration's poles; null = the lesson's own side names. */
	names: SideNames | null;
}

/** How long a fetched answer is trusted before the next render asks again. */
export const SUPPORT_REFRESH_MS = 10_000;

export interface RegistrationSupportState {
	mainId: string | null;
	source: SupportSource | null;
	data: SupportData | null;
	loading: boolean;
	failed: boolean;
	fetchedAt: number;
}

export const registrationSupport: RegistrationSupportState = {
	mainId: null,
	source: null,
	data: null,
	loading: false,
	failed: false,
	fetchedAt: 0,
};

export function resetRegistrationSupport(): void {
	registrationSupport.mainId = null;
	registrationSupport.source = null;
	registrationSupport.data = null;
	registrationSupport.loading = false;
	registrationSupport.failed = false;
	registrationSupport.fetchedAt = 0;
}

/** What a support screen shows for this lesson. */
export type SupportView =
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'ready'; result: ShownSupportBySide; names: SideNames | null };

export function sourceOf(main: LessonSettingsHolder | null | undefined): SupportSource {
	return registrationAskedPosition(main) ? 'registration' : 'own';
}

export function supportViewOf(
	main: LessonSettingsHolder | null | undefined,
	state: RegistrationSupportState,
	mainId: string,
): SupportView {
	const mine = state.mainId === mainId && state.source === sourceOf(main);
	if (!mine || !state.data) {
		return state.failed && mine ? { kind: 'failed' } : { kind: 'loading' };
	}

	return { kind: 'ready', result: state.data.support, names: state.data.names };
}

/** Is a new fetch due: nothing in flight, and the answer is missing or stale. */
export function fetchIsDue(
	state: RegistrationSupportState,
	mainId: string,
	now: number,
	source: SupportSource = 'registration',
): boolean {
	if (state.loading) return false;
	if (state.mainId !== mainId || state.source !== source) return true;

	return now - state.fetchedAt >= SUPPORT_REFRESH_MS;
}

function fetchSupport(source: SupportSource, mainId: string): Promise<SupportData> {
	if (source === 'own') {
		return classSupportBySide({ mainId }).then((r) => ({ support: r.support, names: null }));
	}

	return classRegistrationSupport({ mainId }).then((r) => ({
		support: r.support,
		names: { a: r.poleA, b: r.poleB },
	}));
}

/** Ask the server for the totals when due. Safe to call on every render. */
export function refreshRegistrationSupport(
	mainId: string,
	force = false,
	source: SupportSource = 'registration',
): void {
	if (!force && !fetchIsDue(registrationSupport, mainId, Date.now(), source)) return;
	if (registrationSupport.mainId !== mainId || registrationSupport.source !== source) {
		resetRegistrationSupport();
	}
	registrationSupport.mainId = mainId;
	registrationSupport.source = source;
	registrationSupport.loading = true;
	registrationSupport.failed = false;
	fetchSupport(source, mainId)
		.then((data) => {
			if (registrationSupport.mainId !== mainId || registrationSupport.source !== source) return;
			registrationSupport.data = data;
		})
		.catch((error: unknown) => {
			captureException(error, { operation: 'classroom.supportBySide', mainId, source });
			if (registrationSupport.mainId === mainId) registrationSupport.failed = true;
		})
		.finally(() => {
			registrationSupport.loading = false;
			registrationSupport.fetchedAt = Date.now();
			m.redraw();
		});
}

/** Retry from a screen: the right callable for this lesson, now. */
export function retrySupport(main: LessonSettingsHolder | null | undefined, mainId: string): void {
	refreshRegistrationSupport(mainId, true, sourceOf(main));
}

/**
 * The view for `mainId`, asking the server first when due. `allowed` false (a
 * student who may not see it) never asks.
 */
export function supportForScreen(
	main: LessonSettingsHolder | null | undefined,
	mainId: string,
	allowed = true,
): SupportView {
	if (allowed && mainId) refreshRegistrationSupport(mainId, false, sourceOf(main));

	return supportViewOf(main, registrationSupport, mainId);
}
