import { FC, useCallback, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation, useNavigate } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { setDoc } from 'firebase/firestore';

import { Statement, SortType, Role, StatementType } from '@freedi/shared-types';
import { Layers, Sparkles, Lightbulb } from 'lucide-react';
import { sortByConsensus } from '@/redux/utils/selectorFactories';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import SuggestionCard from './suggestionCard/SuggestionCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import { useViewLayers } from '@/controllers/hooks/useViewLayers';
import { useLazyLoadOptions } from '@/view/pages/statement/hooks/useLazyLoadOptions';
import styles from './SuggestionCards.module.scss';
import { GroupedSuggestionCard } from '@/view/components/atomic/molecules/GroupedSuggestionCard';
import { SectionDivider } from '@/view/components/atomic/molecules/SectionDivider';
import { ViewLayersToggle } from '@/view/components/atomic/molecules/ViewLayersToggle';
import {
	createViewLayersDataSelector,
	composeViewLayers,
} from '@/redux/statements/condensationSelectors';
import type { RootState } from '@/redux/store';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

// Helper function to sort statements
function sortStatements(
	statements: Statement[],
	sort: string | undefined,
	randomSeed: number,
	parentStatement?: Statement,
): Statement[] {
	const sorted = [...statements];

	if (sort === 'backend-order') {
		return sorted;
	}

	switch (sort) {
		case SortType.accepted: {
			const isSingleLike = parentStatement?.statementSettings?.evaluationType === 'single-like';
			if (isSingleLike) {
				return sorted.sort((a, b) => {
					const aLikes = a.evaluation?.sumPro || a.pro || 0;
					const bLikes = b.evaluation?.sumPro || b.pro || 0;

					return bLikes - aLikes;
				});
			}

			return sorted.sort(sortByConsensus);
		}
		case SortType.newest:
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case SortType.random:
			if (randomSeed) {
				return sorted.sort((a, b) => {
					const hashA = `${randomSeed}-${a.statementId}`
						.split('')
						.reduce(
							(acc, char, index) => acc + ((char.charCodeAt(0) * (index + 1) * randomSeed) % 10000),
							0,
						);
					const hashB = `${randomSeed}-${b.statementId}`
						.split('')
						.reduce(
							(acc, char, index) => acc + ((char.charCodeAt(0) * (index + 1) * randomSeed) % 10000),
							0,
						);

					return hashA - hashB;
				});
			}

			return sorted.sort(() => Math.random() - 0.5);
		case SortType.mostUpdated:
			return sorted.sort((a, b) => b.lastUpdate - a.lastUpdate);
		default:
			return sorted;
	}
}

const SuggestionCards: FC = () => {
	const params = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { t } = useTranslation();

	const statementId = useMemo(() => params.statementId, [params.statementId]);
	const statement = useSelector(statementSelector(statementId));
	const defaultSort = statement?.statementSettings?.defaultSortType || SortType.newest;
	const sort = params.sort || defaultSort;

	const dispatch = useDispatch();
	const isQuestion = statement?.statementType === StatementType.question;
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const [randomSeed, setRandomSeed] = useState(Date.now());

	const isAdmin =
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;
	const { showHiddenCards } = useShowHiddenCards();
	// Lazy-load older options as the user scrolls the list (the page subscription
	// only loads the newest window; this pages in the rest on demand).
	const { sentinelRef, isLoadingMore, hasMore } = useLazyLoadOptions(statementId);

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

	const plan = useMemo(() => composeViewLayers(viewData, layers), [viewData, layers]);

	// Hidden-card visibility rules applied to the flat raw list: non-hidden are
	// always shown; admins see hidden when the toggle is on; users see their own.
	const visibleFlatRaw = useMemo(() => {
		const canSee = (st: Statement): boolean => {
			if (st.hide !== true) return true;
			if (isAdmin) return showHiddenCards;

			return st.creatorId === creator?.uid;
		};

		return sortStatements(plan.flatRaw.filter(canSee), sort, randomSeed, statement);
	}, [plan.flatRaw, isAdmin, showHiddenCards, creator?.uid, sort, randomSeed, statement]);

	// FLIP animates only on intentional changes (user re-sorts, toggles
	// layers, cards added/removed) — NOT on every live evaluation update.
	// Keying on the full id order caused react-flip-toolkit to read
	// getBoundingClientRect on every card whenever consensus reordered the
	// list, which froze the screen on mobile during active deliberation.
	const flipKey = useMemo(
		() =>
			`${sort}-${randomSeed}-${layers.raw}-${layers.synth}-${layers.cluster}-${visibleFlatRaw.length}`,
		[sort, randomSeed, layers, visibleFlatRaw.length],
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
			{ statementSettings: { condensation: { viewLayers: layers } } },
			{ merge: true },
		).catch((error) =>
			logError(error, {
				operation: 'SuggestionCards.setDefaultViewLayers',
				statementId: statement.statementId,
			}),
		);
	}, [statement, layers]);

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
			<ViewLayersToggle
				layers={layers}
				onChange={setLayers}
				isAdmin={isAdmin}
				onSetDefault={handleSetDefault}
				hasUserOverride={hasUserOverride}
				onReset={resetToDefault}
			/>

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
			<Flipper
				flipKey={flipKey}
				spring={{ stiffness: 300, damping: 30 }}
				className={styles['suggestions-wrapper']}
			>
				{visibleFlatRaw.map((statementSub: Statement) => (
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
			{isLoadingMore && (
				<div className={styles['lazyLoadStatus']} role="status">
					{t('Loading more…')}
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
