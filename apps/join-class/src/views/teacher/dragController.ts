import m from 'mithril';
import { t } from '@/lib/i18n';
import { IDLE, arrowDelta, dragReducer } from '@/lib/classroom/dragReducer';
import type { DragAction, DropTarget } from '@/lib/classroom/dragReducer';
import { moveStudent } from './consoleActions';
import { consoleState } from './consoleState';

/**
 * The thin view shell around the pure drag reducer: pointer events for the
 * mouse path, key events for the keyboard path, the live-region text, and the
 * one call to `classMoveStudent` when the reducer reports a move. No library.
 */

export interface ChipRef {
	uid: string;
	name: string;
	from: DropTarget;
}

const DROP_ATTR = 'data-drop';
const DROP_NONE = 'none';
const PRIMARY_BUTTON = 0;

export function targetName(target: DropTarget): string {
	return target === null ? t('console.unplaced_name') : t('console.table_n', { n: target });
}

function dispatch(action: DragAction): void {
	const { state, effect } = dragReducer(consoleState.drag, action);
	consoleState.drag = state;
	if (state.mode === 'idle') consoleState.ghost = null;
	if (effect) {
		consoleState.focusUid = effect.uid;
		void moveStudent(consoleState.mainId, effect.uid, effect.toTable);
	}
	m.redraw();
}

/** Table number under a viewport point, `null` for the strip, `undefined` for nothing. */
function dropAt(x: number, y: number): DropTarget | undefined {
	const el = document.elementFromPoint(x, y)?.closest(`[${DROP_ATTR}]`);
	const raw = el?.getAttribute(DROP_ATTR);
	if (raw === null || raw === undefined) return undefined;

	return raw === DROP_NONE ? null : Number(raw);
}

export function dropAttrs(target: DropTarget): Record<string, string> {
	return { [DROP_ATTR]: target === null ? DROP_NONE : String(target) };
}

let removeWindowListeners: (() => void) | null = null;

/** Drop any in-flight drag and its window listeners (console unmounting). */
export function abortDrag(): void {
	removeWindowListeners?.();
	removeWindowListeners = null;
	consoleState.drag = IDLE;
	consoleState.ghost = null;
}

export function pressChip(event: PointerEvent, chip: ChipRef): void {
	if (event.button !== PRIMARY_BUTTON || consoleState.drag.mode === 'keyboard') return;
	dispatch({ type: 'press', uid: chip.uid, from: chip.from, x: event.clientX, y: event.clientY });

	const onMove = (e: PointerEvent): void => {
		const over = dropAt(e.clientX, e.clientY);
		dispatch({ type: 'pointerMove', x: e.clientX, y: e.clientY, over: over ?? chip.from });
		if (consoleState.drag.mode === 'pointer') {
			consoleState.ghost = { name: chip.name, x: e.clientX, y: e.clientY };
		}
	};
	const detach = (): void => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onCancel);
		removeWindowListeners = null;
	};
	const finish = (type: 'drop' | 'cancel'): void => {
		detach();
		dispatch({ type });
	};
	const onUp = (): void => finish('drop');
	const onCancel = (): void => finish('cancel');
	removeWindowListeners = detach;
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
	window.addEventListener('pointercancel', onCancel);
}

export function keyChip(
	event: KeyboardEvent,
	chip: ChipRef,
	tableNumbers: readonly number[],
): void {
	const drag = consoleState.drag;
	const mine = drag.mode === 'keyboard' && drag.uid === chip.uid;
	if (!mine) {
		if (event.key === ' ' && drag.mode === 'idle') {
			event.preventDefault();
			consoleState.announce = t('console.picked_up', { name: chip.name });
			dispatch({ type: 'pickUp', uid: chip.uid, from: chip.from });
		}

		return;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		consoleState.announce = t('console.move_cancelled');
		dispatch({ type: 'cancel' });

		return;
	}
	if (event.key === ' ' || event.key === 'Enter') {
		event.preventDefault();
		dispatch({ type: 'drop' });

		return;
	}
	const delta = arrowDelta(event.key, document.documentElement.dir === 'rtl');
	if (delta === null) return;
	event.preventDefault();
	dispatch({ type: 'step', delta, tableNumbers });
	if (consoleState.drag.mode === 'keyboard') {
		consoleState.announce = t('console.over_target', {
			target: targetName(consoleState.drag.over),
		});
		m.redraw();
	}
}

export function blurChip(chip: ChipRef): void {
	const drag = consoleState.drag;
	if (drag.mode === 'keyboard' && drag.uid === chip.uid) dispatch({ type: 'cancel' });
}
