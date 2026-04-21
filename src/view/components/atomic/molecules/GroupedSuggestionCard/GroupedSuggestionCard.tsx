import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import { Layers, ChevronDown, Users, ExternalLink, Info } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import type { RootState } from '@/redux/store';
import { useGroupMembers } from '@/controllers/hooks/useGroupMembers';
import ScoreBreakdown from './ScoreBreakdown';

/**
 * GroupedSuggestionCard — displays a cluster statement that represents
 * several similar originals ("sub-solutions"). Visually distinct from a
 * loose SuggestionCard: tinted surface, stacked-paper shadows, corner
 * count ribbon, preview peek of first members, and a footer drawer strip
 * that drills into the full member list with a thread-rail connector.
 *
 * All styling lives in `_grouped-suggestion-card.scss` (BEM). This React
 * wrapper assembles classes and passes state; evaluation UI is injected
 * via `evaluationSlot` so the card stays display-only.
 */
export interface GroupedSuggestionCardProps {
	cluster: Statement;
	/** 'both' = inline accordion; 'clusters-only' = drill-down modal via parent. */
	mode: 'both' | 'clusters-only';
	allowDrillToOriginals: boolean;
	renderOriginal?: (original: Statement) => React.ReactNode;
	evaluationSlot?: React.ReactNode;
	onDrillToOriginals?: (cluster: Statement) => void;
	className?: string;
}

const PREVIEW_LIMIT = 2;
const MANY_THRESHOLD = 15;

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
	const [mobileMetaOpen, setMobileMetaOpen] = useState(false);
	const disclosureId = useId();
	const regionId = `${disclosureId}-originals`;

	const integratedOptions = useMemo(
		() => cluster.integratedOptions ?? [],
		[cluster.integratedOptions],
	);
	const count = integratedOptions.length;
	const evaluation = cluster.evaluation;
	const isClustersOnly = mode === 'clusters-only';

	// Preview peek: read whatever originals Redux already has (no network).
	// If none are cached, the peek lines quietly omit themselves.
	const previewMembers = useAppSelector((state: RootState) =>
		integratedOptions
			.slice(0, PREVIEW_LIMIT)
			.map((id) => state.statements.statements.find((s) => s.statementId === id))
			.filter((s): s is Statement => Boolean(s)),
	);
	const previewRemainder = Math.max(0, count - previewMembers.length);

	// Full member list — only fetched from Firestore when the drawer opens.
	const shouldFetch = mode === 'both' && expanded;
	const { members, isLoading } = useGroupMembers(
		shouldFetch ? cluster.statementId : undefined,
		shouldFetch,
	);

	const numberOfEvaluators = evaluation?.numberOfEvaluators ?? 0;
	const isAwaiting = numberOfEvaluators === 0;

	const classes = clsx(
		'grouped-suggestion',
		isClustersOnly && 'grouped-suggestion--clusters-only',
		expanded && 'grouped-suggestion--expanded',
		isAwaiting && 'grouped-suggestion--awaiting',
		mobileMetaOpen && 'grouped-suggestion--meta-open',
		className,
	);

	// Corner ribbon copy — "Pair" / "N" / "15+"
	let ribbonText: string;
	let ribbonModifier: string | false = false;
	if (count === 2) {
		ribbonText = t('Pair');
		ribbonModifier = 'grouped-suggestion__count-ribbon--pair';
	} else if (count > MANY_THRESHOLD) {
		ribbonText = `${MANY_THRESHOLD}+`;
		ribbonModifier = 'grouped-suggestion__count-ribbon--many';
	} else {
		ribbonText = String(count);
	}

	const cardAriaLabel = t('Group of {count} related suggestions: {title}')
		.replace('{count}', String(count))
		.replace('{title}', cluster.statement);

	const countLabel = t('Represents {count} suggestions').replace('{count}', String(count));

	const handleDrawerClick = () => {
		if (isClustersOnly && allowDrillToOriginals && onDrillToOriginals) {
			onDrillToOriginals(cluster);

			return;
		}
		if (isClustersOnly && !allowDrillToOriginals) {
			return;
		}
		setExpanded((v) => !v);
	};

	const drawerVisible = mode === 'both' || (isClustersOnly && allowDrillToOriginals);
	const drawerCountLabel = isClustersOnly
		? t('View {count} originals').replace('{count}', String(count))
		: expanded
			? t('Hide originals')
			: t('Show originals');

	return (
		<div className={classes} aria-label={cardAriaLabel}>
			<span
				className={clsx('grouped-suggestion__count-ribbon', ribbonModifier)}
				aria-label={countLabel}
			>
				<Layers size={14} aria-hidden />
				<span aria-hidden>{ribbonText}</span>
				<span className="sr-only">{countLabel}</span>
			</span>

			<div className="grouped-suggestion__card card card--elevated">
				<div className="grouped-suggestion__header">
					<div className="grouped-suggestion__title-wrap">
						<h3 className="card__title">{cluster.statement}</h3>
						{cluster.description && <p className="card__subtitle">{cluster.description}</p>}
					</div>
				</div>

				{/* Preview peek — first 2 member titles (italic, prefixed ›) */}
				{previewMembers.length > 0 && (
					<div
						className="grouped-suggestion__preview"
						aria-label={t('Preview of grouped suggestions')}
					>
						{previewMembers.map((m) => (
							<span key={m.statementId} className="grouped-suggestion__preview-line">
								<span className="grouped-suggestion__preview-text">{m.statement}</span>
							</span>
						))}
						{previewRemainder > 0 && (
							<span className="grouped-suggestion__preview-more">
								{t('…and {count} more').replace('{count}', String(previewRemainder))}
							</span>
						)}
					</div>
				)}

				{evaluation && (
					<>
						<div
							className={clsx(
								'grouped-suggestion__meta',
								isAwaiting && 'grouped-suggestion__meta--muted',
							)}
							aria-label={t('Aggregated evaluation')}
						>
							{isAwaiting ? (
								<span className="grouped-suggestion__meta-item">
									{t('Awaiting community feedback')}
								</span>
							) : (
								<>
									<span className="grouped-suggestion__meta-item">
										<Users size={14} aria-hidden />
										{numberOfEvaluators} {t('evaluators')}
									</span>
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
								</>
							)}
						</div>
						{/* Mobile-only toggle to reveal the meta row */}
						<button
							type="button"
							className="grouped-suggestion__meta-toggle"
							aria-expanded={mobileMetaOpen}
							onClick={() => setMobileMetaOpen((v) => !v)}
						>
							<Info size={14} aria-hidden />
							{mobileMetaOpen ? t('Hide details') : t('More info')}
						</button>
					</>
				)}

				{evaluationSlot && <div className="grouped-suggestion__body">{evaluationSlot}</div>}

				<ScoreBreakdown clusterId={cluster.statementId} />

				{drawerVisible && (
					<button
						id={disclosureId}
						type="button"
						className="grouped-suggestion__drawer"
						aria-expanded={mode === 'both' ? expanded : undefined}
						aria-controls={mode === 'both' ? regionId : undefined}
						onClick={handleDrawerClick}
					>
						<span className="grouped-suggestion__drawer-label">
							<Layers size={16} aria-hidden />
							<span>
								<strong>{count}</strong> {t('originals in this group')}
							</span>
						</span>
						<span className="grouped-suggestion__drawer-chevron" aria-hidden>
							<ChevronDown size={18} />
						</span>
						<span className="sr-only">{drawerCountLabel}</span>
					</button>
				)}

				{mode === 'both' && expanded && (
					<div
						id={regionId}
						className="grouped-suggestion__originals"
						role="region"
						aria-live="polite"
						aria-label={t('Original suggestions represented by this group')}
					>
						{isLoading && <p className="grouped-suggestion__original-note">{t('Loading…')}</p>}
						{!isLoading && members.length === 0 && (
							<p className="grouped-suggestion__original-note">{t('No originals found.')}</p>
						)}
						{members.map((original) => (
							<div key={original.statementId} className="grouped-suggestion__original">
								<div className="grouped-suggestion__original-row">
									<div className="grouped-suggestion__original-text">
										{renderOriginal ? (
											renderOriginal(original)
										) : (
											<>
												<span>{original.statement}</span>
												<span className="grouped-suggestion__original-note">
													{t('Already counted in the group above')}
												</span>
											</>
										)}
									</div>
									<Link
										to={`/statement/${original.statementId}`}
										className="grouped-suggestion__original-nav"
										aria-label={t('Open original: {title}').replace('{title}', original.statement)}
									>
										<ExternalLink size={14} aria-hidden />
										<span>{t('Open')}</span>
									</Link>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default GroupedSuggestionCard;
