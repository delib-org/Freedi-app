import { FC, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';

import { Statement, SortType, SelectionFunction, Role } from 'delib-npm';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import { sortSubStatements } from '../../statementsEvaluationCont';
import SuggestionCard from './suggestionCard/SuggestionCard';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import styles from './SuggestionCards.module.scss';

// Constants
const CARD_GAP = 30;
const ANIMATION_DURATION = 300;
const DEFAULT_ELEMENT_HEIGHT = 200;
const WRAPPER_PADDING = 60;

/**
 * Sorts statements based on the provided sort type
 * @param statements - Array of statements to sort
 * @param sortType - Type of sorting to apply
 * @returns Sorted array of statements
 */
const sortStatements = (statements: Statement[], sortType: SortType): Statement[] => {
	if (!statements.length) return [];

	const sorted = [...statements];

	switch (sortType) {
		case SortType.accepted:
			return sorted.sort((a, b) => b.consensus - a.consensus);
		case SortType.newest:
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case SortType.random:
			return sorted.sort(() => Math.random() - 0.5);
		case SortType.mostUpdated:
			return sorted.sort((a, b) => b.lastUpdate - a.lastUpdate);
		default:
			return sorted;
	}
};

/**
 * Filters statements based on visibility and user permissions
 * @param statements - Array of statements to filter
 * @param creatorId - ID of the current user
 * @param isAdmin - Whether the current user is an admin
 * @returns Filtered array of statements
 */
const filterVisibleStatements = (
	statements: Statement[],
	creatorId: string | undefined,
	isAdmin: boolean
): Statement[] => {
	return statements.filter(statement =>
		statement.hide !== true || statement.creatorId === creatorId || isAdmin
	);
};

/**
 * Calculates total height for all statements including gaps
 * @param statements - Array of statements
 * @returns Total height in pixels
 */
const calculateTotalHeight = (statements: Statement[]): number => {
	return statements.reduce((acc, statement) =>
		acc + (statement.elementHight ?? DEFAULT_ELEMENT_HEIGHT) + CARD_GAP, 0
	);
};

/**
 * Props interface for SuggestionCards component
 */
interface SuggestionCardsProps {
	/** Override sort type from URL params */
	propSort?: SortType;
	/** Filter statements by selection function */
	selectionFunction?: SelectionFunction;
	/** Override statements from Redux store */
	subStatements?: Statement[];
}

/**
 * SuggestionCards component renders a list of statement suggestions with sorting and animation capabilities
 * 
 * Features:
 * - Animated sorting with smooth height transitions
 * - Filtering based on user permissions and visibility
 * - Support for different sort types (newest, accepted, random, most updated)
 * - Real-time updates via Redux subscriptions
 * 
 * @param propSort - Override sort type from URL params
 * @param selectionFunction - Filter statements by selection function
 * @param subStatements - Override statements from Redux store
 */
const SuggestionCards: FC<SuggestionCardsProps> = ({
	propSort,
	selectionFunction,
	subStatements: propSubStatements,
}) => {
	const { sort: sortFromUrl, statementId } = useParams();
	const dispatch = useDispatch();

	// Determine the sort type from props or URL params
	const currentSort = (propSort || sortFromUrl || SortType.newest) as SortType;

	// Redux selectors
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const statement = useSelector(statementSelector(statementId));
	const statementsFromStore = useSelector(statementOptionsSelector(statement?.statementId));

	// Local state
	const [totalHeight, setTotalHeight] = useState(0);
	const [isAnimating, setIsAnimating] = useState(false);

	// Memoized admin check
	const isAdmin = useMemo(() =>
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin,
		[creator?.uid, parentSubscription?.statement?.creatorId, parentSubscription?.role]
	);

	// Memoized filtered statements
	const filteredSubStatements = useMemo(() => {
		const baseStatements = propSubStatements ||
			(selectionFunction
				? statementsFromStore.filter(sub => sub.evaluation.selectionFunction === selectionFunction)
				: statementsFromStore
			);

		return filterVisibleStatements(baseStatements || [], creator?.uid, isAdmin);
	}, [propSubStatements, statementsFromStore, selectionFunction, creator?.uid, isAdmin]);

	// Memoized sorted statements with optimized sorting
	const sortedSubStatements = useMemo(() => sortStatements(filteredSubStatements, currentSort), [filteredSubStatements, currentSort]);

	// Memoized height calculation
	const calculatedHeight = useMemo(() => calculateTotalHeight(sortedSubStatements), [sortedSubStatements]);

	// Update total height with animation trigger
	useEffect(() => {
		if (calculatedHeight !== totalHeight) {
			setIsAnimating(true);
			setTotalHeight(calculatedHeight);

			// Reset animation state after transition
			const timer = setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);

			return () => clearTimeout(timer);
		}
	}, [calculatedHeight, totalHeight]);

	// Trigger sorting animation updates in Redux (for positioning)
	useEffect(() => {
		if (sortedSubStatements.length > 0) {
			sortSubStatements(sortedSubStatements, currentSort, CARD_GAP);
		}
	}, [sortedSubStatements, currentSort]);

	// Load statement if needed
	useEffect(() => {
		if (!statement && statementId) {
			getStatementFromDB(statementId)
				.then((statement: Statement) => dispatch(setStatement(statement)))
				.catch((error) => console.error('Failed to load statement:', error));
		}
	}, [statement, statementId, dispatch]);

	// Listen to evaluations
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		return unsubscribe;
	}, [statementId]);

	// Early returns for edge cases
	if (!statement) return null;

	if (!filteredSubStatements.length) {
		return (
			<EmptyScreen
				setShowModal={() => {
					// No-op function for compatibility
				}}
			/>
		);
	}

	return (
		<div
			className={`${styles['suggestions-wrapper']} ${isAnimating ? styles['animating'] : ''}`}
			style={{
				height: `${totalHeight + WRAPPER_PADDING}px`,
				transition: isAnimating ? `height ${ANIMATION_DURATION}ms ease-in-out` : 'none'
			}}
		>
			{sortedSubStatements?.map((statementSub: Statement) => (
				<SuggestionCard
					key={statementSub.statementId}
					parentStatement={statement}
					siblingStatements={sortedSubStatements}
					statement={statementSub}
				/>
			))}
		</div>
	);
};

export default SuggestionCards;
