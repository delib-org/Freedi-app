import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Framing } from '@freedi/shared-types';

/**
 * The view-mode the user has selected for a parent question's options list.
 * - 'regular' = no framing applied, options shown as a flat list (current default).
 * - 'semantic' = group by the hybrid-auto framing (legacy k-means).
 * - 'topic'   = group by the topic-cluster framing (LLM-derived).
 */
export const FramingMode = {
	regular: 'regular',
	semantic: 'semantic',
	topic: 'topic',
} as const;

// eslint-disable-next-line no-redeclare
export type FramingMode = (typeof FramingMode)[keyof typeof FramingMode];

export interface FramingsState {
	/** Framings loaded from Firestore for each parent question, keyed by parentStatementId. */
	byParent: Record<string, Framing[]>;
	/** User-selected view mode per parent question. */
	modeByParent: Record<string, FramingMode>;
	/** Loading flag per parent so the UI can defer rendering until framings arrive. */
	loadingByParent: Record<string, boolean>;
}

const initialState: FramingsState = {
	byParent: {},
	modeByParent: {},
	loadingByParent: {},
};

export const framingsSlice = createSlice({
	name: 'framings',
	initialState,
	reducers: {
		setFramingsForParent(state, action: PayloadAction<{ parentId: string; framings: Framing[] }>) {
			state.byParent[action.payload.parentId] = action.payload.framings;
		},
		setFramingsLoading(state, action: PayloadAction<{ parentId: string; loading: boolean }>) {
			state.loadingByParent[action.payload.parentId] = action.payload.loading;
		},
		setFramingMode(state, action: PayloadAction<{ parentId: string; mode: FramingMode }>) {
			state.modeByParent[action.payload.parentId] = action.payload.mode;
		},
		clearFramingsForParent(state, action: PayloadAction<string>) {
			delete state.byParent[action.payload];
			delete state.modeByParent[action.payload];
			delete state.loadingByParent[action.payload];
		},
	},
});

export const { setFramingsForParent, setFramingsLoading, setFramingMode, clearFramingsForParent } =
	framingsSlice.actions;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StateSelector<T> = (state: any) => T;

export function createFramingsByParentSelector(
	selectByParent: StateSelector<Record<string, Framing[]>>,
) {
	return (parentId: string | undefined) =>
		createSelector([selectByParent], (byParent) => {
			if (!parentId) return [] as Framing[];

			return byParent[parentId] ?? [];
		});
}

export function createFramingModeSelector(
	selectModeByParent: StateSelector<Record<string, FramingMode>>,
) {
	return (parentId: string | undefined) =>
		createSelector([selectModeByParent], (modeByParent) => {
			if (!parentId) return FramingMode.regular;

			return modeByParent[parentId] ?? FramingMode.regular;
		});
}

/**
 * Resolve `mode` (regular | semantic | topic) to a concrete `framingId` from
 * the framings loaded for this parent. Returns null for `regular` (no framing
 * applied) or when no matching framing exists.
 */
export function resolveActiveFramingId(mode: FramingMode, framings: Framing[]): string | null {
	if (mode === FramingMode.regular) return null;
	const wanted = mode === FramingMode.semantic ? 'hybrid-auto' : 'topic-cluster';
	const match = framings.find((f) => f.createdBy === wanted && f.isActive);

	return match?.framingId ?? null;
}
