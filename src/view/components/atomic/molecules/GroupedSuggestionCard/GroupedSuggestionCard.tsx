import React, { useId, useState } from 'react';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import { Layers, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useGroupMembers } from '@/controllers/hooks/useGroupMembers';
import ScoreBreakdown from './ScoreBreakdown';

/**
 * GroupedSuggestionCard — displays a condensed cluster statement that
 * represents several similar originals. All styling lives in
 * `_grouped-suggestion-card.scss` (BEM). This React wrapper only assembles
 * classes and composes sub-sections.
 *
 * Evaluation UI (agreement bars, consensus, confidence) is provided by the
 * parent via `evaluationSlot` — the card itself is display-only so it can
 * be reused across main, MC, and (read-only) drill-downs.
 */
export interface GroupedSuggestionCardProps {
	cluster: Statement;
	/** Mode this surface is rendering in. Controls whether the inline accordion
	 *  expands to show originals, or the card shows a "View N originals" link
	 *  that opens a drill-down modal handled by the parent. */
	mode: 'both' | 'clusters-only';
	/** Whether drill-down to originals is allowed by admin settings. Only
	 *  relevant in clusters-only mode. */
	allowDrillToOriginals: boolean;
	/** Parent-provided renderer for each original (e.g. a regular option card
	 *  in read-only mode). In "both" mode the originals inside the accordion
	 *  are rendered in a simple text form; pass this to use richer rendering. */
	renderOriginal?: (original: Statement) => React.ReactNode;
	/** Parent-provided evaluation UI (agreement bars, buttons, etc.). */
	evaluationSlot?: React.ReactNode;
	/** Opens the clusters-only drill-down modal. Parent controls the modal. */
	onDrillToOriginals?: (cluster: Statement) => void;
	className?: string;
}

const GroupedSuggestionCard: React.FC<GroupedSuggestionCardProps> = ({
	cluster,
	mode,
	allowDrillToOriginals,
	renderOriginal,
	evaluationSlot,
	onDrillToOriginals,
	className,
}) => {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const disclosureId = useId();
	const regionId = `${disclosureId}-originals`;

	const integratedOptions = cluster.integratedOptions ?? [];
	const count = integratedOptions.length;
	const evaluation = cluster.evaluation;

	// Lazy-fetch members only when expanded (in "both" mode) or when the
	// drill-down is a link-only affordance but consumer didn't provide a
	// modal handler.
	const shouldFetch = mode === 'both' && expanded;
	const { members, isLoading } = useGroupMembers(
		shouldFetch ? cluster.statementId : undefined,
		shouldFetch,
	);

	const isClustersOnly = mode === 'clusters-only';

	const classes = clsx(
		'grouped-suggestion',
		isClustersOnly && 'grouped-suggestion--clusters-only',
		expanded && 'grouped-suggestion--expanded',
		className,
	);

	const countLabel = t('Represents {count} suggestions').replace('{count}', String(count));

	const handleDisclosure = () => {
		if (isClustersOnly && allowDrillToOriginals && onDrillToOriginals) {
			onDrillToOriginals(cluster);

			return;
		}
		if (isClustersOnly && !allowDrillToOriginals) {
			return;
		}
		setExpanded((v) => !v);
	};

	const disclosureVisible = mode === 'both' || (isClustersOnly && allowDrillToOriginals);

	return (
		<div className={classes}>
			<div className="grouped-suggestion__card card card--elevated">
				<div className="grouped-suggestion__header">
					<div className="grouped-suggestion__title-wrap">
						<h3 className="card__title">{cluster.statement}</h3>
						{cluster.description && <p className="card__subtitle">{cluster.description}</p>}
					</div>
					<span className="grouped-suggestion__count-pill" aria-label={countLabel}>
						<Layers size={14} aria-hidden />
						<span aria-hidden>{count}</span>
						<span className="sr-only">{countLabel}</span>
					</span>
				</div>

				{evaluation && (
					<div className="grouped-suggestion__meta" aria-label={t('Aggregated evaluation')}>
						{typeof evaluation.numberOfEvaluators === 'number' && (
							<span className="grouped-suggestion__meta-item">
								<Users size={14} aria-hidden />
								{evaluation.numberOfEvaluators} {t('evaluators')}
							</span>
						)}
						{typeof evaluation.averageEvaluation === 'number' && (
							<span className="grouped-suggestion__meta-item">
								{t('Average')}: {evaluation.averageEvaluation.toFixed(2)}
							</span>
						)}
						{typeof evaluation.agreement === 'number' && (
							<span className="grouped-suggestion__meta-item">
								{t('Agreement')}: {(evaluation.agreement * 100).toFixed(0)}%
							</span>
						)}
						{typeof evaluation.confidenceIndex === 'number' && (
							<span className="grouped-suggestion__meta-item">
								{t('Confidence')}: {(evaluation.confidenceIndex * 100).toFixed(0)}%
							</span>
						)}
					</div>
				)}

				{evaluationSlot && <div className="grouped-suggestion__body">{evaluationSlot}</div>}

				<ScoreBreakdown clusterId={cluster.statementId} />

				{disclosureVisible && (
					<button
						id={disclosureId}
						type="button"
						className="grouped-suggestion__disclosure"
						aria-expanded={mode === 'both' ? expanded : undefined}
						aria-controls={mode === 'both' ? regionId : undefined}
						onClick={handleDisclosure}
					>
						{isClustersOnly
							? t('View {count} originals').replace('{count}', String(count))
							: expanded
								? t('Hide {count} originals').replace('{count}', String(count))
								: t('Show {count} originals').replace('{count}', String(count))}
						{mode === 'both' &&
							(expanded ? (
								<ChevronUp size={16} aria-hidden />
							) : (
								<ChevronDown size={16} aria-hidden />
							))}
					</button>
				)}

				{mode === 'both' && expanded && (
					<div
						id={regionId}
						className="grouped-suggestion__originals"
						role="region"
						aria-label={t('Original suggestions represented by this group')}
					>
						{isLoading && <p className="grouped-suggestion__original-note">{t('Loading…')}</p>}
						{!isLoading && members.length === 0 && (
							<p className="grouped-suggestion__original-note">{t('No originals found.')}</p>
						)}
						{members.map((original) => (
							<div key={original.statementId} className="grouped-suggestion__original">
								{renderOriginal ? (
									renderOriginal(original)
								) : (
									<>
										<span className="grouped-suggestion__original-text">{original.statement}</span>
										<span className="grouped-suggestion__original-note">
											{t('Already counted in the group above')}
										</span>
									</>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default GroupedSuggestionCard;
