import React, { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import type { RootState } from '@/redux/store';
import { createLinksByClusterSelector } from '@/redux/clusterEvaluationLinks/clusterEvaluationLinksSlice';
import { listenToClusterEvaluationLinks } from '@/controllers/db/clusterEvaluationLinks/listenToClusterEvaluationLinks';

/**
 * Counts-only admin-/voter-facing breakdown of a cluster's aggregated
 * score. Shows how many unique evaluators contributed, split between
 * direct evaluations on the cluster vs inherited from originals, and (when
 * expanded) a per-original list with evaluator count + average score.
 *
 * No user identities are displayed — ever. The underlying provenance
 * collection only stores `userId`, never display names, and this component
 * never surfaces that field.
 */
export interface ScoreBreakdownProps {
	clusterId: string;
	/** When true, renders the richer curation-page variant with per-original
	 *  title + 'Last aggregated' timestamp. Default false = compact card view. */
	verbose?: boolean;
	/** When true, expose the expanded breakdown always (no accordion). */
	alwaysExpanded?: boolean;
	/** Resolve an original's `statement` text from its id. Injected by the
	 *  host because different apps have different Redux shapes. */
	getOriginalTitle?: (statementId: string) => string | undefined;
	className?: string;
}

interface PerOriginal {
	sourceStatementId: string;
	count: number;
	average: number;
}

const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({
	clusterId,
	verbose = false,
	alwaysExpanded = false,
	getOriginalTitle,
	className,
}) => {
	const { t } = useTranslation();
	const disclosureId = useId();
	const regionId = `${disclosureId}-breakdown`;
	const [open, setOpen] = useState(alwaysExpanded);

	// Lazy listener — only mounted while this component is on screen.
	useEffect(() => {
		if (!clusterId) return;
		const unsub = listenToClusterEvaluationLinks(clusterId);

		return () => unsub();
	}, [clusterId]);

	const selectLinks = useMemo(
		() => createLinksByClusterSelector((state: RootState) => state.clusterEvaluationLinks.byId),
		[],
	);
	const links = useSelector(selectLinks(clusterId));

	const stats = useMemo(() => {
		let directCount = 0;
		let inheritedEvalCount = 0;
		let lastUpdated = 0;
		const perOriginal = new Map<string, { count: number; sum: number }>();

		for (const link of links) {
			if (link.direct) directCount++;
			for (const ih of link.inheritedFrom) {
				inheritedEvalCount++;
				const existing = perOriginal.get(ih.sourceStatementId);
				if (existing) {
					existing.count += 1;
					existing.sum += ih.value;
				} else {
					perOriginal.set(ih.sourceStatementId, { count: 1, sum: ih.value });
				}
			}
			if (link.updatedAt > lastUpdated) lastUpdated = link.updatedAt;
		}

		const perOriginalList: PerOriginal[] = Array.from(perOriginal.entries())
			.map(([sourceStatementId, { count, sum }]) => ({
				sourceStatementId,
				count,
				average: count > 0 ? sum / count : 0,
			}))
			.sort((a, b) => b.count - a.count);

		return {
			numberOfEvaluators: links.length,
			directCount,
			inheritedEvalCount,
			distinctOriginals: perOriginalList.length,
			perOriginal: perOriginalList,
			lastUpdated,
		};
	}, [links]);

	// Load original titles from statements slice as a default.
	const defaultGetTitle = useAppSelector((state: RootState) => {
		return (id: string) => state.statements.statements.find((s) => s.statementId === id)?.statement;
	});
	const resolveTitle = getOriginalTitle ?? defaultGetTitle;

	if (stats.numberOfEvaluators === 0) {
		// Intentionally silent when nobody has evaluated yet.
		return null;
	}

	const summary = t(
		'{count} evaluators · {direct} direct + {inherited} inherited from {originals} originals',
	)
		.replace('{count}', String(stats.numberOfEvaluators))
		.replace('{direct}', String(stats.directCount))
		.replace('{inherited}', String(stats.inheritedEvalCount))
		.replace('{originals}', String(stats.distinctOriginals));

	const expanded = alwaysExpanded || open;
	const classes = ['score-breakdown', className].filter(Boolean).join(' ');

	return (
		<div className={classes}>
			{alwaysExpanded ? (
				<div className="score-breakdown__summary">
					<Info size={14} aria-hidden />
					<span>{summary}</span>
				</div>
			) : (
				<button
					id={disclosureId}
					type="button"
					className="score-breakdown__trigger"
					aria-expanded={expanded}
					aria-controls={regionId}
					onClick={() => setOpen((v) => !v)}
				>
					<Info size={14} aria-hidden />
					<span className="score-breakdown__summary-text">{summary}</span>
					{expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
				</button>
			)}

			{expanded && (
				<div
					id={regionId}
					className="score-breakdown__body"
					role="region"
					aria-label={t('Score breakdown')}
				>
					<ul className="score-breakdown__list">
						{stats.perOriginal.map((entry) => (
							<li key={entry.sourceStatementId} className="score-breakdown__row">
								<span className="score-breakdown__row-title">
									{resolveTitle?.(entry.sourceStatementId) ?? entry.sourceStatementId}
								</span>
								<span className="score-breakdown__row-meta">
									{t('{count} votes · avg {avg}')
										.replace('{count}', String(entry.count))
										.replace('{avg}', entry.average.toFixed(2))}
								</span>
							</li>
						))}
					</ul>
					{verbose && stats.lastUpdated > 0 && (
						<p className="score-breakdown__timestamp">
							{t('Last aggregated')}: {new Date(stats.lastUpdated).toLocaleString()}
						</p>
					)}
				</div>
			)}
		</div>
	);
};

export default ScoreBreakdown;
