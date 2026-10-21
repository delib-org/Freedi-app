/**
 * Pure reducer behind drag-to-move (pointer) and its keyboard path
 * (Space pick up, arrows choose, Space/Enter drop, Escape cancel). The view is a
 * thin shell that dispatches actions and, on a `move` effect, calls
 * `classMoveStudent`. UX section 5 "Drag-to-move" and section 9.
 */

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_START_DISTANCE = 6;

/** A drop target: a table number (1-based) or `null` = the unplaced strip. */
export type DropTarget = number | null;

export type DragState =
	| { mode: 'idle' }
	| { mode: 'pressed'; uid: string; from: DropTarget; x: number; y: number }
	| { mode: 'pointer'; uid: string; from: DropTarget; over: DropTarget }
	| { mode: 'keyboard'; uid: string; from: DropTarget; over: DropTarget };

export type DragAction =
	| { type: 'press'; uid: string; from: DropTarget; x: number; y: number }
	| { type: 'pointerMove'; x: number; y: number; over: DropTarget }
	| { type: 'pickUp'; uid: string; from: DropTarget }
	| { type: 'step'; delta: 1 | -1; tableNumbers: readonly number[] }
	| { type: 'drop' }
	| { type: 'cancel' };

export interface MoveEffect {
	uid: string;
	toTable: DropTarget;
}

export interface DragResult {
	state: DragState;
	/** Set when the action completed a drop onto a different place. */
	effect: MoveEffect | null;
}

export const IDLE: DragState = { mode: 'idle' };

function done(state: DragState, effect: MoveEffect | null = null): DragResult {
	return { state, effect };
}

/** Order of keyboard targets: the unplaced strip first, then every table. */
export function keyboardTargets(tableNumbers: readonly number[]): DropTarget[] {
	return [null, ...tableNumbers];
}

export function nextKeyboardTarget(
	current: DropTarget,
	delta: 1 | -1,
	tableNumbers: readonly number[],
): DropTarget {
	const targets = keyboardTargets(tableNumbers);
	const at = Math.max(0, targets.indexOf(current));

	return targets[(at + delta + targets.length) % targets.length];
}

export function dragReducer(state: DragState, action: DragAction): DragResult {
	switch (action.type) {
		case 'press':
			return done({
				mode: 'pressed',
				uid: action.uid,
				from: action.from,
				x: action.x,
				y: action.y,
			});
		case 'pointerMove': {
			if (state.mode === 'pressed') {
				const moved = Math.hypot(action.x - state.x, action.y - state.y);
				if (moved < DRAG_START_DISTANCE) return done(state);

				return done({ mode: 'pointer', uid: state.uid, from: state.from, over: action.over });
			}
			if (state.mode === 'pointer') return done({ ...state, over: action.over });

			return done(state);
		}
		case 'pickUp':
			return done({ mode: 'keyboard', uid: action.uid, from: action.from, over: action.from });
		case 'step': {
			if (state.mode !== 'keyboard') return done(state);

			return done({
				...state,
				over: nextKeyboardTarget(state.over, action.delta, action.tableNumbers),
			});
		}
		case 'drop': {
			if (state.mode === 'pointer' || state.mode === 'keyboard') {
				const moved = state.over !== state.from;

				return done(IDLE, moved ? { uid: state.uid, toTable: state.over } : null);
			}

			return done(IDLE);
		}
		case 'cancel':
			return done(IDLE);
	}
}

/** Arrow key to step direction; physical right is "previous" in a right-to-left page. */
export function arrowDelta(key: string, rtl: boolean): 1 | -1 | null {
	if (key === 'ArrowDown') return 1;
	if (key === 'ArrowUp') return -1;
	if (key === 'ArrowRight') return rtl ? -1 : 1;
	if (key === 'ArrowLeft') return rtl ? 1 : -1;

	return null;
}
