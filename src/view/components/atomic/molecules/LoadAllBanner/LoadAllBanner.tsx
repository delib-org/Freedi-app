import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import clsx from 'clsx';
import { Button } from '@/view/components/atomic/atoms/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	bulkLoadStatements,
	getStatementsCount,
} from '@/controllers/db/statements/bulkLoadStatements';
import {
	BulkLoadMode,
	fullyLoadedScopeSelector,
	setScopeFullyLoaded,
	statementsSelector,
} from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';
import { BULK_LOAD } from '@/constants/common';

export interface LoadAllBannerProps {
	/** Root of the scope (parent for 'direct', subtree root for 'descendants') */
	rootId: string;
	/** 'direct' = children only (agreement map), 'descendants' = whole subtree (mind-map) */
	mode: BulkLoadMode;
	className?: string;
}

type BannerPhase = 'idle' | 'loading' | 'done';

/**
 * "Showing X of N statements — Load all" banner.
 *
 * Shown when the lazily-loaded view holds fewer statements than exist in the
 * scope (N from a cheap count() aggregation). Clicking "Load all" streams
 * every page through the getBulkStatements endpoint with live progress, then
 * flags the scope as fully loaded so delta listeners take over.
 */
const LoadAllBanner: React.FC<LoadAllBannerProps> = ({ rootId, mode, className }) => {
	const { t, currentLanguage } = useTranslation();
	const dispatch = useDispatch();

	const [phase, setPhase] = useState<BannerPhase>('idle');
	const [totalCount, setTotalCount] = useState<number | null>(null);
	const [loadedCount, setLoadedCount] = useState(0);
	const [visible, setVisible] = useState(true);

	const fullyLoadedScope = useSelector(fullyLoadedScopeSelector(rootId));
	const statements = useSelector(statementsSelector);

	const inStoreCount = useMemo(
		() =>
			statements.filter((statement) =>
				mode === 'direct' ? statement.parentId === rootId : statement.parents?.includes(rootId),
			).length,
		[statements, mode, rootId],
	);

	const formatNumber = useCallback(
		(value: number) => new Intl.NumberFormat(currentLanguage).format(value),
		[currentLanguage],
	);

	// Fetch the real scope size once per scope (cheap aggregation query)
	useEffect(() => {
		let cancelled = false;
		setTotalCount(null);

		if (fullyLoadedScope) return;

		getStatementsCount(rootId, mode).then((count) => {
			if (!cancelled) setTotalCount(count);
		});

		return () => {
			cancelled = true;
		};
	}, [rootId, mode, fullyLoadedScope]);

	// Auto-hide the confirmation a few seconds after completion
	useEffect(() => {
		if (phase !== 'done') return;

		const timeout = setTimeout(() => setVisible(false), BULK_LOAD.DONE_BANNER_HIDE_MS);

		return () => clearTimeout(timeout);
	}, [phase]);

	const handleLoadAll = useCallback(async () => {
		setPhase('loading');
		setLoadedCount(0);
		try {
			const { watermark } = await bulkLoadStatements(rootId, mode, setLoadedCount);
			dispatch(setScopeFullyLoaded({ rootId, mode, watermark }));
			setPhase('done');
		} catch (error) {
			logError(error, {
				operation: 'LoadAllBanner.handleLoadAll',
				statementId: rootId,
				metadata: { mode },
			});
			setPhase('idle');
		}
	}, [dispatch, rootId, mode]);

	// Nothing to offer: scope already complete, fully loaded earlier, or dismissed
	if (!visible) return null;
	if (phase === 'idle' && (fullyLoadedScope || totalCount === null || totalCount <= inStoreCount))
		return null;

	const classes = clsx(
		'load-all-banner',
		phase === 'loading' && 'load-all-banner--loading',
		phase === 'done' && 'load-all-banner--done',
		className,
	);

	return (
		<div className={classes} role="status" aria-live="polite">
			{phase === 'idle' && totalCount !== null && (
				<>
					<span className="load-all-banner__text">
						{`${t('Showing')} ${formatNumber(inStoreCount)} ${t('of')} ${formatNumber(totalCount)} ${t('statements')}`}
					</span>
					<span className="load-all-banner__action">
						<Button text={t('Load all')} variant="secondary" size="small" onClick={handleLoadAll} />
					</span>
				</>
			)}
			{phase === 'loading' && (
				<span className="load-all-banner__progress">
					{`${t('Loading all statements')}… ${formatNumber(loadedCount)}${totalCount ? ` / ${formatNumber(totalCount)}` : ''}`}
				</span>
			)}
			{phase === 'done' && (
				<span className="load-all-banner__text">{t('All statements loaded')}</span>
			)}
		</div>
	);
};

export default LoadAllBanner;
