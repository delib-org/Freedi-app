import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import {
	Layers,
	ChevronDown,
	Users,
	ExternalLink,
	Info,
	Sparkles,
	Tags,
	Undo2,
	RefreshCw,
} from 'lucide-react';
import { shallowEqual } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import type { RootState } from '@/redux/store';
import { useGroupMembers } from '@/controllers/hooks/useGroupMembers';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import {
	reverseIntegration,
	regenerateSynthesisProposal,
} from '@/controllers/db/integration/integrationController';
import { logError } from '@/utils/errorHandling';
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
export type GroupedSuggestionPipeline = 'synthesis' | 'topic' | 'semantic' | 'custom' | 'unknown';

export interface GroupedSuggestionCardProps {
	cluster: Statement;
	/** 'both' = inline accordion; 'clusters-only' = drill-down modal via parent. */
	mode: 'both' | 'clusters-only';
	allowDrillToOriginals: boolean;
	renderOriginal?: (original: Statement) => React.ReactNode;
	evaluationSlot?: React.ReactNode;
	onDrillToOriginals?: (cluster: Statement) => void;
	/**
	 * Explicit pipeline tint. When omitted, falls back to detection from
	 * `cluster.derivedByPipeline` (synthesis/topic-cluster). Supply this when
	 * the parent knows the active framing (hybrid-auto → 'semantic',
	 * admin/ai-custom → 'custom') so the card surfaces the correct accent.
	 */
	pipeline?: GroupedSuggestionPipeline;
	/**
	 * When provided, the expanded drawer renders THESE member statements instead
	 * of fetching from Firestore. The view-layer model passes a topic cluster's
	 * "direct raw" (members not covered by a nested synth) so the 3-level dedup
	 * stays driven by the selector and can't drift from a separate fetch.
	 */
	explicitMembers?: Statement[];
	/**
	 * Extra content rendered at the top of the expanded drawer — used to nest
	 * synth-proposal cards inside a topic-cluster card (3-level view).
	 */
	nestedSlot?: React.ReactNode;
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
	pipeline: pipelineOverride,
	explicitMembers,
	nestedSlot,
	className,
}) => {
	const { t, dir } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const [mobileMetaOpen, setMobileMetaOpen] = useState(false);
	const [isReversing, setIsReversing] = useState(false);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const disclosureId = useId();
	const regionId = `${disclosureId}-originals`;
	// Authorize against the parent deliberation: a creator/admin of the
	// parent (or any ancestor in the trust chain) can reverse / regenerate.
	const { isAdmin } = useAuthorization(cluster.parentId);

	const integratedOptions = useMemo(
		() => cluster.integratedOptions ?? [],
		[cluster.integratedOptions],
	);
	const count = integratedOptions.length;
	const evaluation = cluster.evaluation;
	const isClustersOnly = mode === 'clusters-only';
	const pipeline = cluster.derivedByPipeline;
	const isSynthesis = pipeline === 'synthesis';
	const isTopicCluster = pipeline === 'topic-cluster';
	// Effective pipeline tint — explicit prop wins so the parent can flag
	// 'semantic' (hybrid-auto framing) or 'custom' (admin framing). Falls back
	// to detection from cluster.derivedByPipeline.
	const effectivePipeline: GroupedSuggestionPipeline =
		pipelineOverride ?? (isSynthesis ? 'synthesis' : isTopicCluster ? 'topic' : 'unknown');
	const isSemantic = effectivePipeline === 'semantic';
	const isCustom = effectivePipeline === 'custom';

	// Both synthesis and cluster cards now use a single disclosure (the footer
	// drawer) for provenance. The compact 2-line preview is only shown for
	// non-synthesis clusters; synthesis cards keep the proposal text dominant.
	const previewSliceLimit = PREVIEW_LIMIT;

	// Read source originals from Redux only — no network. Originals live in
	// the parent's options collection and are already loaded by the parent
	// listener, so this resolves synchronously in the common case. Anything
	// not yet cached gets quietly omitted; the drawer fetches the rest on
	// demand.
	const previewMembers = useAppSelector(
		(state: RootState) =>
			integratedOptions
				.slice(0, previewSliceLimit)
				.map((id) => state.statements.statements.find((s) => s.statementId === id))
				.filter((s): s is Statement => Boolean(s)),
		shallowEqual,
	);
	const previewRemainder = Math.max(0, count - previewMembers.length);

	// Full member list. When the parent supplies `explicitMembers` (view-layer
	// model) we render those directly; otherwise fetch from Firestore on open.
	const shouldFetch = mode === 'both' && expanded && !explicitMembers;
	const { members: fetchedMembers, isLoading: isFetching } = useGroupMembers(
		shouldFetch ? cluster.statementId : undefined,
		shouldFetch,
	);
	const members = explicitMembers ?? fetchedMembers;
	const isLoading = explicitMembers ? false : isFetching;

	const numberOfEvaluators = evaluation?.numberOfEvaluators ?? 0;
	const isAwaiting = numberOfEvaluators === 0;

	const classes = clsx(
		'grouped-suggestion',
		isClustersOnly && 'grouped-suggestion--clusters-only',
		expanded && 'grouped-suggestion--expanded',
		isAwaiting && 'grouped-suggestion--awaiting',
		mobileMetaOpen && 'grouped-suggestion--meta-open',
		isSynthesis && 'grouped-suggestion--synthesis',
		(isTopicCluster || effectivePipeline === 'topic') && 'grouped-suggestion--topic',
		isSemantic && 'grouped-suggestion--semantic',
		isCustom && 'grouped-suggestion--custom',
		className,
	);

	// Pipeline badge — surfaces derivedByPipeline so users can tell
	// synthesis (paraphrase merge) apart from auto-grouping. Hybrid /
	// manual clusters get no badge — the corner ribbon already indicates
	// "this is a group". The badge only fires for the two pipelines that
	// have a meaningfully different epistemic story.
	let pipelineBadge: React.ReactNode = null;
	if (isSynthesis) {
		const label = t('Synthesized');
		const tip = t('AI-merged paraphrases of the same idea');
		pipelineBadge = (
			<span
				className="grouped-suggestion__pipeline-badge grouped-suggestion__pipeline-badge--synthesis"
				title={tip}
				aria-label={tip}
			>
				<Sparkles size={12} aria-hidden />
				<span>{label}</span>
			</span>
		);
	} else if (isTopicCluster) {
		const label = t('Topic cluster');
		const tip = t('Grouped by topic taxonomy');
		pipelineBadge = (
			<span
				className="grouped-suggestion__pipeline-badge grouped-suggestion__pipeline-badge--topic"
				title={tip}
				aria-label={tip}
			>
				<Tags size={12} aria-hidden />
				<span>{label}</span>
			</span>
		);
	}

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

	const handleRegenerateProposal = async () => {
		const confirmCopy = t(
			'Regenerate this synthesized proposal? The AI will redraft the title, description, and sections from the {count} source ideas. Existing evaluations on the proposal stay intact.',
		).replace('{count}', String(count));
		if (!window.confirm(confirmCopy)) return;
		setIsRegenerating(true);
		try {
			const result = await regenerateSynthesisProposal({
				clusterStatementId: cluster.statementId,
			});
			if (result.cannotSynthesize) {
				const reason = result.splitReason || t('The source ideas span incompatible directions.');
				window.alert(
					t(
						'The AI declined to synthesize this group: {reason} Consider reversing this synthesis and re-running the pipeline so the group can be split.',
					).replace('{reason}', reason),
				);
			}
		} catch (error) {
			logError(error, {
				operation: 'GroupedSuggestionCard.handleRegenerateProposal',
				statementId: cluster.statementId,
			});
			window.alert(t('Regenerating proposal failed. Please try again.'));
		} finally {
			setIsRegenerating(false);
		}
	};

	const handleReverseSynthesis = async () => {
		const confirmCopy = t(
			'Reverse this synthesis? The {count} source ideas will be restored as separate proposals and the synthesized proposal will be hidden. Direct evaluations on the synthesis will be deleted; evaluations on each source idea remain intact.',
		).replace('{count}', String(count));
		if (!window.confirm(confirmCopy)) return;
		setIsReversing(true);
		try {
			await reverseIntegration({ clusterStatementId: cluster.statementId });
		} catch (error) {
			logError(error, {
				operation: 'GroupedSuggestionCard.handleReverseSynthesis',
				statementId: cluster.statementId,
			});
			window.alert(t('Reversing synthesis failed. Please try again.'));
		} finally {
			setIsReversing(false);
		}
	};

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
	// Pipeline-aware drawer copy — synthesis says "source ideas", everyone
	// else says "originals". This makes the drilling discoverable for the
	// most common admin question: "what was this synthesized from?".
	const drawerCountLabel = isSynthesis
		? isClustersOnly
			? t('View {count} source ideas').replace('{count}', String(count))
			: expanded
				? t('Hide source ideas')
				: t('Show source ideas')
		: isClustersOnly
			? t('View {count} originals').replace('{count}', String(count))
			: expanded
				? t('Hide originals')
				: t('Show originals');
	const drawerInlineLabel = isSynthesis
		? t('source ideas synthesized into this proposal')
		: t('originals in this group');
	const originalsRegionAriaLabel = isSynthesis
		? t('Source ideas synthesized into this proposal')
		: t('Original suggestions represented by this group');
	const previewAriaLabel = isSynthesis
		? t('Preview of synthesized source ideas')
		: t('Preview of grouped suggestions');
	const memberAlreadyCountedNote = isSynthesis
		? t('Already counted in the synthesized proposal above')
		: t('Already counted in the group above');

	return (
		<div className={classes} dir={dir} aria-label={cardAriaLabel}>
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
						{pipelineBadge}
						<h3
							className={clsx('card__title', isSynthesis && 'grouped-suggestion__proposal-title')}
						>
							{cluster.statement}
						</h3>
						{cluster.description && (
							<p
								className={clsx(
									'card__subtitle',
									isSynthesis && 'grouped-suggestion__proposal-description',
								)}
							>
								{cluster.description}
							</p>
						)}
					</div>
				</div>

				{/* Synthesis: proposal-first layout. The title + description above
				    are the dominant element; the single source of provenance is
				    the footer drawer ("N source ideas"). Here we surface only the
				    primary CTA — read the full AI-authored proposal. Admin actions
				    (Regenerate, Reverse) live inside the expanded drawer, in the
				    context of the sources they act on. */}
				{isSynthesis && (
					<div className="grouped-suggestion__proposal-actions">
						<Link
							to={`/statement/${cluster.statementId}`}
							className="grouped-suggestion__proposal-read"
						>
							<ExternalLink size={14} aria-hidden />
							<span>{t('Read full proposal')}</span>
						</Link>
					</div>
				)}

				{/* Compact preview peek for non-synthesis clusters. */}
				{previewMembers.length > 0 && !isSynthesis && (
					<div className="grouped-suggestion__preview" aria-label={previewAriaLabel}>
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
							{isSynthesis ? <Sparkles size={16} aria-hidden /> : <Layers size={16} aria-hidden />}
							<span>
								<strong>{count}</strong> {drawerInlineLabel}
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
						aria-label={originalsRegionAriaLabel}
					>
						{isSynthesis && isAdmin && (
							<div className="grouped-suggestion__proposal-actions grouped-suggestion__proposal-actions--admin">
								<button
									type="button"
									className="grouped-suggestion__proposal-admin-btn"
									onClick={handleRegenerateProposal}
									disabled={isRegenerating}
									title={t('Regenerate proposal (admin)')}
									aria-label={t('Regenerate proposal (admin)')}
								>
									<RefreshCw size={12} aria-hidden />
									<span>{isRegenerating ? t('Regenerating…') : t('Regenerate proposal')}</span>
								</button>
								<button
									type="button"
									className="grouped-suggestion__proposal-admin-btn grouped-suggestion__proposal-admin-btn--danger"
									onClick={handleReverseSynthesis}
									disabled={isReversing}
									title={t('Reverse synthesis (admin)')}
									aria-label={t('Reverse synthesis (admin)')}
								>
									<Undo2 size={12} aria-hidden />
									<span>{isReversing ? t('Reversing…') : t('Reverse synthesis')}</span>
								</button>
							</div>
						)}
						{nestedSlot && <div className="grouped-suggestion__nested">{nestedSlot}</div>}
						{isLoading && <p className="grouped-suggestion__original-note">{t('Loading…')}</p>}
						{!isLoading && members.length === 0 && !nestedSlot && (
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
													{memberAlreadyCountedNote}
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
