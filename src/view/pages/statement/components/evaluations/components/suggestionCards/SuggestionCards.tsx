import { FC, useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
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
 * Sorts statements based on the provided sort type - optimized for performance
 * @param statements - Array of statements to sort
 * @param sortType - Type of sorting to apply
 * @returns Sorted array of statements
 */
const sortStatements = (statements: Statement[], sortType: SortType): Statement[] => {
	if (!statements.length) return statements; // Return original empty array instead of new one

	// Optimize sorting by using more efficient comparison functions
	const sorted = [...statements];

	switch (sortType) {
		case SortType.accepted:
			return sorted.sort((a, b) => (b.consensus || 0) - (a.consensus || 0));
		case SortType.newest:
			return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
		case SortType.random:
			// More efficient random sort for better performance
			for (let i = sorted.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[sorted[i], sorted[j]] = [sorted[j], sorted[i]];
			}

			return sorted;
		case SortType.mostUpdated:
			return sorted.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));
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

	// Early return if no statementId
	if (!statementId) return null;

	// Determine the sort type from props or URL params
	const currentSort = (propSort || sortFromUrl || SortType.newest) as SortType;

	// Redux selectors
	const statement = useSelector(statementSelector(statementId));

	// Early return if no statement
	if (!statement) return null;

	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const statementsFromStore = useSelector(statementOptionsSelector(statement.statementId));

	// Local state
	const [totalHeight, setTotalHeight] = useState(0);
	const [isAnimating, setIsAnimating] = useState(false);
	const animationTimeoutRef = useRef<number | null>(null);

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

	// Optimized animation handler
	const triggerAnimation = useCallback(() => {
		if (animationTimeoutRef.current) {
			clearTimeout(animationTimeoutRef.current);
		}

		setIsAnimating(true);
		animationTimeoutRef.current = window.setTimeout(() => {
			setIsAnimating(false);
			animationTimeoutRef.current = null;
		}, ANIMATION_DURATION);
	}, []);

	// Update total height with animation trigger
	useEffect(() => {
		if (calculatedHeight !== totalHeight) {
			setTotalHeight(calculatedHeight);
			triggerAnimation();
		}
	}, [calculatedHeight, totalHeight, triggerAnimation]);

	// Trigger sorting animation updates in Redux (for positioning) - optimized to avoid unnecessary calls
	useEffect(() => {
		// Only update Redux positioning when we have statements and sort has actually changed
		if (sortedSubStatements.length > 0) {
			// Use a slight delay to batch with other updates and avoid excessive Redux dispatches
			const positionUpdateTimeout = setTimeout(() => {
				sortSubStatements(sortedSubStatements, currentSort, CARD_GAP);
			}, 0);

			return () => clearTimeout(positionUpdateTimeout);
		}
	}, [sortedSubStatements, currentSort]);

	// Load statement if needed - optimized to prevent unnecessary DB calls
	useEffect(() => {
		if (!statement && statementId) {
			// Add a flag to prevent multiple simultaneous requests
			let isCancelled = false;

			getStatementFromDB(statementId)
				.then((statement: Statement) => {
					if (!isCancelled) {
						dispatch(setStatement(statement));
					}
				})
				.catch((error) => {
					if (!isCancelled) {
						console.error('Failed to load statement:', error);
					}
				});

			return () => {
				isCancelled = true;
			};
		}
	}, [statement, statementId, dispatch]);

	// Listen to evaluations - optimized subscription management
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		// Return the unsubscribe function directly for proper cleanup
		return unsubscribe;
	}, [statementId]);

	// Cleanup animation timeout on unmount
	useEffect(() => {
		return () => {
			if (animationTimeoutRef.current) {
				clearTimeout(animationTimeoutRef.current);
			}
		};
	}, []);

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
			{sortedSubStatements.map((statementSub: Statement) => (
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

export default memo(SuggestionCards);
