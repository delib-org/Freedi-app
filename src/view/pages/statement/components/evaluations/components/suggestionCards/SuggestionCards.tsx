import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation, useNavigate } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { setDoc } from 'firebase/firestore';

import { Statement, SortType, Role, StatementType } from '@freedi/shared-types';
import { Layers, Sparkles, Lightbulb } from 'lucide-react';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import SuggestionCard from './suggestionCard/SuggestionCard';
import { applyManualOrder, sortStatements } from './suggestionOrdering';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import { useViewLayers } from '@/controllers/hooks/useViewLayers';
import { useLazyLoadOptions } from '@/view/pages/statement/hooks/useLazyLoadOptions';
import { useAutoLoadAllForSort } from '@/view/pages/statement/hooks/useAutoLoadAllForSort';
import { useThrottledOrder } from '@/view/pages/statement/hooks/useThrottledOrder';
import { usePrefersReducedMotion } from '@/controllers/hooks/usePrefersReducedMotion';
import { UI } from '@/constants/common';
import styles from './SuggestionCards.module.scss';
import { GroupedSuggestionCard } from '@/view/components/atomic/molecules/GroupedSuggestionCard';
import { LoadAllBanner } from '@/view/components/atomic/molecules/LoadAllBanner';
import { SectionDivider } from '@/view/components/atomic/molecules/SectionDivider';
import { ListToolbar } from '@/view/components/atomic/molecules/ListToolbar';
import { useTreeFilterOptional } from '../../../treeView/TreeFilterContext';
import {
	createViewLayersDataSelector,
	composeViewLayers,
	deriveAvailableLayers,
	gateViewLayers,
} from '@/redux/statements/condensationSelectors';
import type { RootState } from '@/redux/store';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

// Stable identity accessor for useThrottledOrder (must not change per render).
const getStatementId = (statement: Statement): string => statement.statementId;

// Reorder glide. Softer than a UI spring on purpose: a card changing rank has
// to be trackable by eye across the whole list, not just snap.
const REORDER_SPRING = { stiffness: 140, damping: 24 } as const;

const SuggestionCards: FC = () => {
	const params = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { t } = useTranslation();

	const statementId = useMemo(() => params.statementId, [params.statementId]);
	const statement = useSelector(statementSelector(statementId));
	const defaultSort = statement?.statementSettings?.defaultSortType || SortType.newest;
	const sort = params.sort || defaultSort;

	// An admin's hand-placed order (written from the Top Answers panel or the
	// Join facilitator panel) replaces the ranking — but only while the reader is
	// on the question's default view. A `:sort` in the URL is the reader asking
	// for a specific ranking, and that request wins.
	const manualOrder = params.sort ? undefined : statement?.statementSettings?.manualOptionOrder;

	const dispatch = useDispatch();
	const isQuestion = statement?.statementType === StatementType.question;
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const [randomSeed, setRandomSeed] = useState(Date.now());

	const isAdmin =
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;
	const { showHiddenCards } = useShowHiddenCards();
	const treeFilter = useTreeFilterOptional();
	// Lazy-load older options as the user scrolls the list (the page subscription
	// only loads the newest window; this pages in the rest on demand).
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadOptions(statementId);

	// Ranked sorts (e.g. "most agreed") must rank the COMPLETE set, not just the
	// newest window — otherwise older high-consensus options never surface. Eagerly
	// bulk-load all direct children when such a sort is active.
	const { isAutoLoading } = useAutoLoadAllForSort(statementId, sort);

	// View-layer derivation (toggle-independent, memoized): split synth / topic /
	// raw and assign each synth to its max-overlap topic.
	const selectViewData = useMemo(
		() =>
			createViewLayersDataSelector((state: RootState) => state.statements.statements)(
				statement?.statementId,
			),
		[statement?.statementId],
	);
	const viewData = useSelector(selectViewData);

	// Three-toggle state — admin sets the default, each user overrides locally.
	const adminDefault = statement?.statementSettings?.condensation?.viewLayers;
	const { layers, setLayers, hasUserOverride, resetToDefault } = useViewLayers(
		statement?.statementId,
		adminDefault,
	);

	// Only layers that actually have data are selectable. Gate the saved toggles
	// against availability so the list never goes blank: an empty selected layer
	// (e.g. Synth with no AI proposals yet) falls back to whatever data exists.
	const availableLayers = useMemo(() => deriveAvailableLayers(viewData), [viewData]);
	const effectiveLayers = useMemo(
		() => gateViewLayers(layers, availableLayers),
		[layers, availableLayers],
	);

	const plan = useMemo(
		() => composeViewLayers(viewData, effectiveLayers),
		[viewData, effectiveLayers],
	);

	// Hidden-card visibility rules applied to the flat raw list: non-hidden are
	// always shown; admins see hidden when the toggle is on; users see their own.
	const visibleFlatRaw = useMemo(() => {
		const canSee = (st: Statement): boolean => {
			if (st.hide !== true) return true;
			if (isAdmin) return showHiddenCards;

			return st.creatorId === creator?.uid;
		};

		const visible = plan.flatRaw.filter(canSee);

		return manualOrder?.length
			? applyManualOrder(visible, manualOrder)
			: sortStatements(visible, sort, randomSeed, statement);
	}, [
		plan.flatRaw,
		isAdmin,
		showHiddenCards,
		creator?.uid,
		sort,
		randomSeed,
		statement,
		manualOrder,
	]);

	// Ordering *intent*: a change here (user picks a sort, re-rolls the random
	// seed, toggles a layer) skips the throttle so the list reorders instantly.
	const orderIntentKey = `${sort}-${randomSeed}-${manualOrder?.join(',') ?? ''}-${effectiveLayers.raw}-${effectiveLayers.synth}-${effectiveLayers.cluster}`;

	// Live evaluation updates can reshuffle the consensus ranking many times a
	// second. Keying FLIP on every one of those made react-flip-toolkit measure
	// each card repeatedly and froze mobile during active deliberation — which
	// is why the order used to be pinned out of the key entirely, killing the
	// animation. Throttling the *applied* order restores the glide and keeps
	// the measuring bounded to once per window.
	const orderedFlatRaw = useThrottledOrder(visibleFlatRaw, getStatementId, {
		intervalMs: UI.REORDER_THROTTLE_DELAY,
		intentKey: orderIntentKey,
	});

	const prefersReducedMotion = usePrefersReducedMotion();

	// A constant key parks FLIP: positions still update, they just jump instead
	// of gliding — the JS equivalent of the reduced-motion CSS blocks.
	const flipKey = useMemo(
		() =>
			prefersReducedMotion ? 'reduced-motion' : orderedFlatRaw.map((s) => s.statementId).join(','),
		[orderedFlatRaw, prefersReducedMotion],
	);

	useEffect(() => {
		if (!statement && statementId)
			getStatementFromDB(statementId).then((s: Statement) => dispatch(setStatement(s)));
	}, [statement, statementId, dispatch]);

	useEffect(() => {
		if (sort === SortType.random) {
			const searchParams = new URLSearchParams(location.search);
			const timestamp = searchParams.get('t');
			setRandomSeed(timestamp ? parseInt(timestamp, 10) : Date.now());
		}
	}, [sort, location.search]);

	const hasSynth = plan.topLevelSynths.length > 0;
	const hasTopics = plan.topicCards.length > 0;
	const hasRaw = visibleFlatRaw.length > 0;

	const handleSubmit = useCallback(() => {
		navigate(`/statement/${statementId}/thank-you`);
	}, [navigate, statementId]);

	// Admin: persist the current toggles as the statement default everyone lands
	// on. Deep-merge so other condensation/settings fields are preserved.
	const handleSetDefault = useCallback(() => {
		if (!statement) return;
		setDoc(
			createStatementRef(statement.statementId),
			{ statementSettings: { condensation: { viewLayers: effectiveLayers } } },
			{ merge: true },
		).catch((error) =>
			logError(error, {
				operation: 'SuggestionCards.setDefaultViewLayers',
				statementId: statement.statementId,
			}),
		);
	}, [statement, effectiveLayers]);

	// Stable reference so memoized GroupedSuggestionCard children don't
	// re-render on every parent render.
	const renderRaw = useCallback(
		(original: Statement) => (
			<SuggestionCard parentStatement={statement ?? undefined} statement={original} />
		),
		[statement],
	);

	if (!statement) return null;
	if (isQuestion && !hasSynth && !hasTopics && !hasRaw) return null;

	const isSubmitMode = statement.statementSettings?.isSubmitMode;

	return (
		<>
			{/* One band of list controls. Filters, view layers and participation
			    stats used to occupy three separate bands above the list — the
			    filter chips even rendered on the Discussion tab, which has no
			    list for them to filter. */}
			{treeFilter && (
				<ListToolbar
					filterMode={treeFilter.filterMode}
					onFilterChange={treeFilter.setFilterMode}
					onToggleCollapse={treeFilter.toggleCollapseExpand}
					isCollapsed={treeFilter.isCollapsed}
					layers={effectiveLayers}
					availableLayers={availableLayers}
					onLayersChange={setLayers}
					isAdmin={isAdmin}
					onSetLayersDefault={handleSetDefault}
					hasLayersOverride={hasUserOverride}
					onResetLayers={resetToDefault}
				/>
			)}

			<LoadAllBanner rootId={statement.statementId} mode="direct" />

			{hasSynth && (
				<>
					<SectionDivider
						label={t('AI proposals')}
						count={plan.topLevelSynths.length}
						icon={<Sparkles size={14} aria-hidden />}
						variant="synthesis"
					/>
					<div className={styles['suggestions-wrapper']}>
						{plan.topLevelSynths.map((synth) => (
							<div key={synth.statementId} className={styles['card-wrapper']}>
								<GroupedSuggestionCard
									cluster={synth}
									mode="both"
									allowDrillToOriginals
									pipeline="synthesis"
									renderOriginal={renderRaw}
								/>
							</div>
						))}
					</div>
				</>
			)}

			{hasTopics && (
				<>
					<SectionDivider
						label={t('Clusters')}
						count={plan.topicCards.length}
						icon={<Layers size={14} aria-hidden />}
						variant="topic"
					/>
					<div className={styles['suggestions-wrapper']}>
						{plan.topicCards.map(({ cluster, nestedSynths, directRaw }) => (
							<div key={cluster.statementId} className={styles['card-wrapper']}>
								<GroupedSuggestionCard
									cluster={cluster}
									mode="both"
									allowDrillToOriginals
									pipeline="topic"
									explicitMembers={directRaw}
									nestedSlot={
										nestedSynths.length > 0
											? nestedSynths.map(({ synth, rawMembers }) => (
													<GroupedSuggestionCard
														key={synth.statementId}
														cluster={synth}
														mode="both"
														allowDrillToOriginals
														pipeline="synthesis"
														explicitMembers={rawMembers}
														renderOriginal={renderRaw}
													/>
												))
											: undefined
									}
									renderOriginal={renderRaw}
								/>
							</div>
						))}
					</div>
				</>
			)}

			{(hasSynth || hasTopics) && hasRaw && (
				<SectionDivider
					label={t('Open ideas')}
					count={visibleFlatRaw.length}
					icon={<Lightbulb size={14} aria-hidden />}
					variant="default"
				/>
			)}
			<Flipper flipKey={flipKey} spring={REORDER_SPRING} className={styles['suggestions-wrapper']}>
				{orderedFlatRaw.map((statementSub: Statement) => (
					<Flipped key={statementSub.statementId} flipId={statementSub.statementId}>
						<div className={styles['card-wrapper']}>
							<SuggestionCard parentStatement={statement} statement={statementSub} />
						</div>
					</Flipped>
				))}
			</Flipper>
			{hasRaw && hasMore && (
				<div ref={sentinelRef} className={styles['lazyLoadSentinel']} aria-hidden="true" />
			)}
			{(isLoadingMore || isAutoLoading) && (
				<div className={styles['lazyLoadStatus']} role="status">
					{isAutoLoading ? `${t('Ranking all options')}…` : t('Loading more…')}
				</div>
			)}
			{isSubmitMode && (
				<div className={styles.submitButtonContainer}>
					<button onClick={handleSubmit} className={styles.submitButton}>
						{t('Submit your vote')}
					</button>
				</div>
			)}
		</>
	);
};

export default SuggestionCards;
