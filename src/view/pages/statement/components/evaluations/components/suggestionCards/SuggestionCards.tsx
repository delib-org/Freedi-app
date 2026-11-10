import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation, useNavigate } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { setDoc } from 'firebase/firestore';
import clsx from 'clsx';

import { Statement, SortType, Role, StatementType } from '@freedi/shared-types';
import { Sparkles, Lightbulb } from 'lucide-react';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import SuggestionCard from './suggestionCard/SuggestionCard';
import Evaluation from '../evaluation/Evaluation';
import { applyManualOrder, includeAnswer, pinFirst, sortStatements } from './suggestionOrdering';
import { useFocusedAnswer } from './useFocusedAnswer';
import { useQuestionScoreAccess } from '../../../questionScreen/useAnswerScoreGate';
import { useAnswersView } from '../../../questionScreen/useAnswersView';
import { useStableQuestion } from '../../../questionScreen/useStableQuestion';
import { RoomAssignmentsContext } from '@/view/components/roomBadge/RoomBadge';
import { listenToUserRoomAssignments } from '@/controllers/db/roomAssignment/getRoomAssignment';
import type { RoomParticipant } from '@freedi/shared-types';
import { useAnswerBatch } from '../../../questionScreen/useAnswerBatch';
import { buildRateViewPath } from '../../../questionScreen/answerSorting';
import { ANSWERS_VIEW_ALL, ANSWERS_VIEW_PARAM } from '../../../questionScreen/answersView';
import { guardScoreSort } from '../../../questionScreen/canSeeScore';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { isHostOfAnswer } from '@/helpers/answerModeration';
import { useAnswerHostContext } from '@/controllers/hooks/useAnswerVisibility';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import { useViewLayers } from '@/controllers/hooks/useViewLayers';
import { useLazyLoadOptions } from '@/view/pages/statement/hooks/useLazyLoadOptions';
import { useAutoLoadAllForSort } from '@/view/pages/statement/hooks/useAutoLoadAllForSort';
import { useRankedAnswers } from '@/view/pages/statement/hooks/useRankedAnswers';
import { rankingSourceForList } from '@/view/pages/statement/hooks/answerRanking';
import { Button } from '@/view/components/atomic/atoms/Button';
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
	// Cards only redraw when something they read about the question changes.
	const cardQuestion = useStableQuestion(statement);
	const defaultSort = statement?.statementSettings?.defaultSortType || SortType.newest;
	const { canSee: canSortByScore } = useQuestionScoreAccess(statement);
	const answersView = useAnswersView(statement);
	const isRateView = answersView.view === 'rate';
	const rateBatch = useAnswerBatch(
		statementId,
		isRateView || answersView.isWaitingToRetryRate,
		answersView.answerCount,
	);
	const sort = guardScoreSort(params.sort || defaultSort, canSortByScore);

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
	const answerHostContext = useAnswerHostContext();
	const treeFilter = useTreeFilterOptional();
	// Lazy-load older options as the user scrolls the list (the page subscription
	// only loads the newest window; this pages in the rest on demand).
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadOptions(statementId);

	// "By agreement" reads the top answers from its index, a page at a time.
	// Orderings no index can rank still need every answer. The Rate view asks
	// for neither: the sampler chooses what it shows.
	const rankingSource = isRateView
		? 'window'
		: rankingSourceForList(sort, statement, (manualOrder?.length ?? 0) > 0);
	const ranked = useRankedAnswers(statementId, rankingSource === 'top-answers');
	const { isListed } = ranked;
	const { isAutoLoading } = useAutoLoadAllForSort(
		rankingSource === 'complete-set' ? statementId : undefined,
		sort,
	);

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

	// Raw and synthesis remain list layers. Topic clusters are explored in Maps.
	const adminDefault = statement?.statementSettings?.condensation?.viewLayers;
	const { layers, setLayers, hasUserOverride, resetToDefault } = useViewLayers(
		statement?.statementId,
		adminDefault,
	);

	// Only layers that actually have data are selectable. Gate the saved toggles
	// against availability so the list never goes blank: an empty selected layer
	// (e.g. Synth with no AI proposals yet) falls back to whatever data exists.
	const availableLayers = useMemo(() => {
		const available = deriveAvailableLayers(viewData);

		return { ...available, cluster: false };
	}, [viewData]);
	const effectiveLayers = useMemo(
		() => gateViewLayers({ ...layers, cluster: false }, availableLayers),
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
			if (isAdmin || isHostOfAnswer(st, answerHostContext)) return showHiddenCards;

			return st.creatorId === creator?.uid;
		};

		const visible = plan.flatRaw.filter((st) => canSee(st) && isListed(st));

		return manualOrder?.length
			? applyManualOrder(visible, manualOrder)
			: sortStatements(visible, sort, randomSeed, statement);
	}, [
		plan.flatRaw,
		isListed,
		isAdmin,
		answerHostContext,
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

	// The pin applies after the throttle, so a just-added answer leads at once.
	// A `:sort` in the URL is the reader asking for a ranking, and that wins here too.
	const shownIds = useMemo(
		() =>
			new Set(
				[...orderedFlatRaw, ...plan.topLevelSynths, ...rateBatch.answers].map(getStatementId),
			),
		[orderedFlatRaw, plan.topLevelSynths, rateBatch.answers],
	);
	const { pinnedId, focusedAnswer, ringId, ringRef } = useFocusedAnswer(
		statementId,
		shownIds,
		params.sort !== undefined,
	);
	const pinnedInStore = useSelector(statementSelector(pinnedId));
	const displayedFlatRaw = useMemo(() => {
		if (isRateView) {
			// A linked or just-added answer leads the batch without being part of it.
			const withPinned = includeAnswer(
				includeAnswer(rateBatch.answers, focusedAnswer),
				pinnedInStore?.parentId === statementId ? pinnedInStore : undefined,
			);

			return pinFirst(withPinned, pinnedId);
		}

		return pinFirst(
			effectiveLayers.raw ? includeAnswer(orderedFlatRaw, focusedAnswer) : orderedFlatRaw,
			pinnedId,
		);
	}, [
		isRateView,
		rateBatch.answers,
		pinnedInStore,
		statementId,
		orderedFlatRaw,
		focusedAnswer,
		effectiveLayers.raw,
		pinnedId,
	]);
	const displayedSynths = useMemo(
		() => pinFirst(plan.topLevelSynths, pinnedId),
		[plan.topLevelSynths, pinnedId],
	);

	const prefersReducedMotion = usePrefersReducedMotion();

	// A constant key parks FLIP: positions still update, they just jump instead
	// of gliding — the JS equivalent of the reduced-motion CSS blocks.
	const flipKey = useMemo(
		() =>
			prefersReducedMotion
				? 'reduced-motion'
				: displayedFlatRaw.map((s) => s.statementId).join(','),
		[displayedFlatRaw, prefersReducedMotion],
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
	const hasRaw = visibleFlatRaw.length > 0;
	const handleLayersChange = useCallback(
		(next: typeof layers) => setLayers({ ...next, cluster: false }),
		[setLayers],
	);

	const openFullList = useCallback(() => {
		const next = new URLSearchParams(location.search);
		next.set(ANSWERS_VIEW_PARAM, ANSWERS_VIEW_ALL);
		navigate({ pathname: location.pathname, search: next.toString() });
	}, [location.pathname, location.search, navigate]);

	const backToRating = useCallback(() => {
		if (!statementId) return;
		const tab = new URLSearchParams(location.search).get('tab');
		navigate(buildRateViewPath(location.pathname, statementId, tab));
	}, [location.pathname, location.search, navigate, statementId]);

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
		(original: Statement) => <SuggestionCard parentStatement={cardQuestion} statement={original} />,
		[cardQuestion],
	);

	// One room listener for the whole list; each badge reads from it.
	const [roomAssignments, setRoomAssignments] = useState<ReadonlyMap<string, RoomParticipant>>(
		() => new Map(),
	);
	useEffect(() => {
		if (!creator?.uid) return;

		return listenToUserRoomAssignments(creator.uid, setRoomAssignments);
	}, [creator?.uid]);

	if (!statement) return null;
	if (isQuestion && !isRateView && !hasSynth && !hasRaw) return null;

	const isSubmitMode = statement.statementSettings?.isSubmitMode;

	return (
		<RoomAssignmentsContext.Provider value={roomAssignments}>
			{/* One band of list controls. Filters, view layers and participation
			    stats used to occupy three separate bands above the list — the
			    filter chips even rendered on the Discussion tab, which has no
			    list for them to filter. */}
			{treeFilter && !isRateView && (
				<ListToolbar
					filterMode={treeFilter.filterMode}
					onFilterChange={treeFilter.setFilterMode}
					onToggleCollapse={treeFilter.toggleCollapseExpand}
					isCollapsed={treeFilter.isCollapsed}
					layers={effectiveLayers}
					availableLayers={availableLayers}
					onLayersChange={handleLayersChange}
					isAdmin={isAdmin}
					onSetLayersDefault={handleSetDefault}
					hasLayersOverride={hasUserOverride}
					onResetLayers={resetToDefault}
				/>
			)}

			{isRateView ? (
				<LoadAllBanner
					key="see-all-answers"
					rootId={statement.statementId}
					mode="direct"
					label={t('See all answers')}
					description={t('{n} answers in this question').replace(
						'{n}',
						String(answersView.answerCount),
					)}
					alwaysOffer
					onLoaded={openFullList}
				/>
			) : (
				<LoadAllBanner key="load-all" rootId={statement.statementId} mode="direct" />
			)}
			{answersView.canReturnToRating && (
				<button type="button" className={styles.backToRating} onClick={backToRating}>
					{t('Back to rating')}
				</button>
			)}

			{hasSynth && !isRateView && (
				<>
					<SectionDivider
						label={t('AI proposals')}
						count={plan.topLevelSynths.length}
						icon={<Sparkles size={14} aria-hidden />}
						variant="synthesis"
					/>
					<div className={styles['suggestions-wrapper']}>
						{displayedSynths.map((synth) => (
							<div
								key={synth.statementId}
								ref={synth.statementId === ringId ? ringRef : undefined}
								className={clsx(
									styles['card-wrapper'],
									synth.statementId === ringId && styles['card-wrapper--focused'],
								)}
							>
								<GroupedSuggestionCard
									cluster={synth}
									mode="both"
									allowDrillToOriginals
									pipeline="synthesis"
									evaluationSlot={<Evaluation statement={synth} variant="card" />}
									renderOriginal={renderRaw}
								/>
							</div>
						))}
					</div>
				</>
			)}

			{hasSynth && hasRaw && !isRateView && (
				<SectionDivider
					label={t('Open ideas')}
					count={visibleFlatRaw.length}
					icon={<Lightbulb size={14} aria-hidden />}
					variant="default"
				/>
			)}
			<Flipper flipKey={flipKey} spring={REORDER_SPRING} className={styles['suggestions-wrapper']}>
				{displayedFlatRaw.map((statementSub: Statement) => (
					<Flipped key={statementSub.statementId} flipId={statementSub.statementId}>
						<div
							ref={statementSub.statementId === ringId ? ringRef : undefined}
							className={clsx(
								styles['card-wrapper'],
								statementSub.statementId === ringId && styles['card-wrapper--focused'],
							)}
						>
							{isRateView && statementSub.isCluster ? (
								<GroupedSuggestionCard
									cluster={statementSub}
									mode="both"
									allowDrillToOriginals
									pipeline="synthesis"
									evaluationSlot={<Evaluation statement={statementSub} variant="card" />}
									renderOriginal={renderRaw}
								/>
							) : (
								<SuggestionCard parentStatement={cardQuestion} statement={statementSub} />
							)}
						</div>
					</Flipped>
				))}
			</Flipper>
			{isRateView && rateBatch.isFinished && (
				<p className={styles.lazyLoadStatus} role="status">
					{t('No more answers to rate right now')}
				</p>
			)}
			{isRateView && rateBatch.isLoading && (
				<div className={styles['lazyLoadStatus']} role="status">
					{t('Loading more…')}
				</div>
			)}
			{ranked.hasMore && (
				<div className={styles.lazyLoadStatus}>
					<Button
						text={t('Show more')}
						variant="secondary"
						size="small"
						loading={ranked.isLoading}
						onClick={ranked.loadMore}
					/>
				</div>
			)}
			{hasRaw && hasMore && rankingSource !== 'top-answers' && !isRateView && (
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
		</RoomAssignmentsContext.Provider>
	);
};

export default SuggestionCards;
