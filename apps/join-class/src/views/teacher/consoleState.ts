import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { IDLE } from '@/lib/classroom/dragReducer';
import type { DragState } from '@/lib/classroom/dragReducer';
import { listenOptions } from '@/lib/classroom/optionsListener';
import type { Unsubscribe } from '@/lib/firebase';

/**
 * Module state of the teacher console (Join's store pattern: plain module
 * state + m.redraw). Views read it; the actions in consoleActions.ts write it.
 */

export type ConsoleView = 'tables' | 'texts';

export interface ActionFailure {
	/** Plain-words label of what failed ("חלוקה לשולחנות"). */
	label: string;
	retry: () => void;
}

export interface GhostChip {
	name: string;
	x: number;
	y: number;
}

export interface ConsoleState {
	mainId: string;
	failure: ActionFailure | null;
	busy: Set<string>;
	drag: DragState;
	ghost: GhostChip | null;
	/** Chip whose "move to another table" menu is open. */
	menuUid: string | null;
	/** Table whose "+ no device" inline form is open. */
	noDeviceFor: number | null;
	/** Chip to refocus after a redraw (keyboard path). */
	focusUid: string | null;
	/** Table whose title link gets focus back after its sheet closes. */
	focusTableN: number | null;
	/** Polite live-region text (moves, strip appearing). */
	announce: string;
	/** Options per question id (challenge for the gate, all for "what they wrote"). */
	options: Map<string, Statement[]>;
	/** The lesson is paused or ended: steps, seats and tables stand still (IA 13.6). */
	held: boolean;
}

export const consoleState: ConsoleState = {
	mainId: '',
	failure: null,
	busy: new Set<string>(),
	drag: IDLE,
	ghost: null,
	menuUid: null,
	noDeviceFor: null,
	focusUid: null,
	focusTableN: null,
	announce: '',
	options: new Map<string, Statement[]>(),
	held: false,
};

export function resetConsoleState(mainId: string): void {
	consoleState.mainId = mainId;
	consoleState.failure = null;
	consoleState.busy = new Set<string>();
	consoleState.drag = IDLE;
	consoleState.ghost = null;
	consoleState.menuUid = null;
	consoleState.noDeviceFor = null;
	consoleState.focusUid = null;
	consoleState.focusTableN = null;
	consoleState.announce = '';
	consoleState.options = new Map<string, Statement[]>();
	consoleState.held = false;
}

export function isBusy(key: string): boolean {
	return consoleState.busy.has(key);
}

/**
 * Run one teacher action. Shows nothing while it works except `isBusy(key)`;
 * on failure keeps an inline error with a retry (callables may not exist yet),
 * never throws. Resolves true on success.
 */
export async function act(
	key: string,
	label: string,
	run: () => Promise<unknown>,
): Promise<boolean> {
	if (consoleState.busy.has(key)) return false;
	consoleState.busy.add(key);
	m.redraw();
	try {
		await run();
		consoleState.failure = null;

		return true;
	} catch (err) {
		console.error(`[TeacherConsole] ${label} failed:`, err);
		consoleState.failure = { label, retry: () => void act(key, label, run) };

		return false;
	} finally {
		consoleState.busy.delete(key);
		m.redraw();
	}
}

export function dismissFailure(): void {
	consoleState.failure = null;
}

// ---- options listeners (one per watched question id) -----------------------

const optionStops = new Map<string, Unsubscribe>();

/** Keep exactly the listeners for `questionIds` running. */
export function watchOptions(questionIds: readonly string[]): void {
	const wanted = new Set(questionIds);
	for (const [id, stop] of optionStops) {
		if (!wanted.has(id)) {
			stop();
			optionStops.delete(id);
			consoleState.options.delete(id);
		}
	}
	for (const id of wanted) {
		if (optionStops.has(id)) continue;
		optionStops.set(
			id,
			listenOptions(
				id,
				(options) => {
					consoleState.options.set(id, options);
					m.redraw();
				},
				(error) => console.error('[TeacherConsole] options listener error:', error),
			),
		);
	}
}

export function stopWatchingOptions(): void {
	for (const stop of optionStops.values()) stop();
	optionStops.clear();
	consoleState.options = new Map<string, Statement[]>();
}
