import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import {
	FramingMode,
	createFramingModeSelector,
	createFramingsByParentSelector,
	resolveActiveFramingId,
	setFramingMode,
	setFramingsForParent,
	setFramingsLoading,
} from '@/redux/framings/framingsSlice';
import { getFramingsForStatement } from '@/controllers/db/framing/framingController';
import type { RootState } from '@/redux/store';
import { logError } from '@/utils/errorHandling';
import type { Framing } from '@freedi/shared-types';

const URL_PARAM = 'framing';
const URL_FRAMING_ID_PARAM = 'framingId';

const selectFramingsByParent = createFramingsByParentSelector(
	(s: RootState) => s.framings.byParent,
);
const selectFramingMode = createFramingModeSelector((s: RootState) => s.framings.modeByParent);

function isValidMode(value: string | null): value is FramingMode {
	return (
		value === FramingMode.regular ||
		value === FramingMode.semantic ||
		value === FramingMode.topic ||
		value === FramingMode.custom
	);
}

interface UseActiveFramingResult {
	mode: FramingMode;
	/**
	 * Switch to a built-in mode. For custom framings, use `setCustomFraming`
	 * which carries the explicit framingId.
	 */
	setMode: (next: FramingMode) => void;
	/** Switch to a specific custom framing by id. */
	setCustomFraming: (framingId: string) => void;
	framingId: string | null;
	availableModes: FramingMode[]; // modes that have a backing Framing in Firestore
	/** Custom framings (admin/ai-created, not hybrid-auto / topic-cluster). */
	customFramings: Framing[];
	framings: Framing[];
	isLoading: boolean;
}

/**
 * Resolve the active framing for a parent question. Loads framings on first
 * mount, syncs the user's selection between Redux and the `?framing=` URL
 * parameter, and returns which modes actually have a backing Framing so the UI
 * can disable empty options.
 */
export function useActiveFraming(parentId: string | undefined): UseActiveFramingResult {
	const dispatch = useAppDispatch();
	const [searchParams, setSearchParams] = useSearchParams();
	const framings = useAppSelector(selectFramingsByParent(parentId));
	const reduxMode = useAppSelector(selectFramingMode(parentId));
	const isLoading = useAppSelector((s) =>
		parentId ? !!s.framings.loadingByParent[parentId] : false,
	);

	// Load framings on first mount if absent.
	useEffect(() => {
		if (!parentId) return;
		// If already cached or already loading, skip.
		if (framings.length > 0) return;
		let cancelled = false;
		(async () => {
			try {
				dispatch(setFramingsLoading({ parentId, loading: true }));
				const fetched = await getFramingsForStatement(parentId);
				if (cancelled) return;
				dispatch(setFramingsForParent({ parentId, framings: fetched }));
			} catch (error) {
				logError(error, {
					operation: 'useActiveFraming.loadFramings',
					statementId: parentId,
				});
			} finally {
				if (!cancelled) dispatch(setFramingsLoading({ parentId, loading: false }));
			}
		})();

		return () => {
			cancelled = true;
		};
		// We deliberately omit `framings.length` from deps — re-running on every
		// framing change would loop. The cached check handles re-renders.
	}, [parentId, dispatch]);

	// Sync URL param INTO Redux on first read.
	useEffect(() => {
		if (!parentId) return;
		const urlMode = searchParams.get(URL_PARAM);
		if (isValidMode(urlMode) && urlMode !== reduxMode) {
			dispatch(setFramingMode({ parentId, mode: urlMode }));
		}
	}, [parentId, searchParams]);

	// `custom` mode carries an explicit framingId in the URL alongside the
	// mode. We only honour it when the URL says so; built-in modes resolve
	// without an id.
	const customFramingIdFromUrl =
		reduxMode === FramingMode.custom ? searchParams.get(URL_FRAMING_ID_PARAM) : null;

	const setMode = useMemo(
		() => (next: FramingMode) => {
			if (!parentId) return;
			dispatch(setFramingMode({ parentId, mode: next }));
			const sp = new URLSearchParams(searchParams);
			if (next === FramingMode.regular) {
				sp.delete(URL_PARAM);
				sp.delete(URL_FRAMING_ID_PARAM);
			} else {
				sp.set(URL_PARAM, next);
				// Built-in modes never carry a framingId — clear it.
				if (next !== FramingMode.custom) {
					sp.delete(URL_FRAMING_ID_PARAM);
				}
			}
			setSearchParams(sp, { replace: true });
		},
		[parentId, dispatch, searchParams, setSearchParams],
	);

	const setCustomFraming = useMemo(
		() => (id: string) => {
			if (!parentId) return;
			dispatch(setFramingMode({ parentId, mode: FramingMode.custom }));
			const sp = new URLSearchParams(searchParams);
			sp.set(URL_PARAM, FramingMode.custom);
			sp.set(URL_FRAMING_ID_PARAM, id);
			setSearchParams(sp, { replace: true });
		},
		[parentId, dispatch, searchParams, setSearchParams],
	);

	const framingId = useMemo(
		() => resolveActiveFramingId(reduxMode, framings, customFramingIdFromUrl),
		[reduxMode, framings, customFramingIdFromUrl],
	);

	const customFramings = useMemo<Framing[]>(
		() =>
			framings.filter(
				(f) => f.isActive && f.createdBy !== 'hybrid-auto' && f.createdBy !== 'topic-cluster',
			),
		[framings],
	);

	const availableModes = useMemo<FramingMode[]>(() => {
		const modes: FramingMode[] = [FramingMode.regular];
		if (framings.some((f) => f.createdBy === 'hybrid-auto' && f.isActive)) {
			modes.push(FramingMode.semantic);
		}
		if (framings.some((f) => f.createdBy === 'topic-cluster' && f.isActive)) {
			modes.push(FramingMode.topic);
		}
		if (customFramings.length > 0) {
			modes.push(FramingMode.custom);
		}

		return modes;
	}, [framings, customFramings]);

	return {
		mode: reduxMode,
		setMode,
		setCustomFraming,
		framingId,
		availableModes,
		customFramings,
		framings,
		isLoading,
	};
}
