import { FC, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation, useNavigate } from 'react-router';
import { Flipper, Flipped } from 'react-flip-toolkit';

import { Statement, SortType, SelectionFunction, Role, StatementType } from '@freedi/shared-types';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import SuggestionCard from './suggestionCard/SuggestionCard';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import styles from './SuggestionCards.module.scss';

interface Props {
	propSort?: SortType | string;
	selectionFunction?: SelectionFunction;
	subStatements?: Statement[];
}

// Helper function to sort statements
function sortStatements(
	statements: Statement[],
	sort: string | undefined,
	randomSeed: number,
	parentStatement?: Statement
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

			return sorted.sort((a, b) => (b.consensus || 0) - (a.consensus || 0));
		}
		case SortType.newest:
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case SortType.random:
			if (randomSeed) {
				return sorted.sort((a, b) => {
					const hashA = `${randomSeed}-${a.statementId}`.split('').reduce(
						(acc, char, index) => acc + char.charCodeAt(0) * (index + 1) * randomSeed % 10000,
						0
					);
					const hashB = `${randomSeed}-${b.statementId}`.split('').reduce(
						(acc, char, index) => acc + char.charCodeAt(0) * (index + 1) * randomSeed % 10000,
						0
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

const SuggestionCards: FC<Props> = ({
	propSort,
	selectionFunction,
	subStatements: propSubStatements,
}) => {
	const params = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { t } = useTranslation();

	// Memoize statementId to prevent unnecessary effect re-runs
	const statementId = useMemo(() => params.statementId, [params.statementId]);
	const sort = propSort || params.sort || SortType.newest;

	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));
	const isQuestion = statement?.statementType === StatementType.question;
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));

	const [randomSeed, setRandomSeed] = useState(Date.now());

	const statementsFromStore = useSelector(
		statementOptionsSelector(statement?.statementId)
	);

	// Check if user is admin
	const isAdmin =
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;

	// Admin preference for showing/hiding hidden cards
	const { showHiddenCards } = useShowHiddenCards();

	// Memoize filtered statements to prevent unnecessary recalculations
	// Logic:
	// - Non-hidden cards are always visible
	// - For admins: hidden cards visibility is controlled by the showHiddenCards toggle
	// - For non-admins: they can see their own hidden cards only
	const visibleStatements = useMemo(() =>
		statementsFromStore.filter(st => {
			// Non-hidden cards are always visible
			if (st.hide !== true) return true;

			// For admins: hidden cards visibility depends entirely on the toggle
			if (isAdmin) {
				return showHiddenCards;
			}

			// For non-admins: they can see their own hidden cards
			if (st.creatorId === creator?.uid) return true;

			// Otherwise, hidden cards are not visible
			return false;
		}),
		[statementsFromStore, creator?.uid, isAdmin, showHiddenCards]
	);

	// Memoize subStatements to prevent unnecessary recalculations
	const filteredStatements = useMemo(() =>
		propSubStatements ||
		(selectionFunction
			? visibleStatements.filter(
				(sub: Statement) =>
					sub.evaluation.selectionFunction === selectionFunction
			)
			: visibleStatements),
		[propSubStatements, selectionFunction, visibleStatements]
	);

	// Sort statements - memoized to prevent unnecessary re-sorts
	const sortedStatements = useMemo(() =>
		sortStatements(filteredStatements, sort, randomSeed, statement),
		[filteredStatements, sort, randomSeed, statement]
	);

	// Create a flip key based on the order of statements
	// This triggers FLIP animation when order changes
	const flipKey = useMemo(() =>
		sortedStatements.map(s => s.statementId).join(','),
		[sortedStatements]
	);

	useEffect(() => {
		if (!statement && statementId)
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement))
			);
	}, [statement, statementId, dispatch]);

	// Listen to evaluations - but only when statementId is truly available and stable
	useEffect(() => {
		// Only set up listener if we have a real statementId (not undefined or changing)
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [statementId]); // Only re-run if statementId actually changes

	useEffect(() => {
		// Generate new random seed when switching to random sort
		if (sort === SortType.random) {
			// Use timestamp from URL query parameter if available (for re-randomization)
			const searchParams = new URLSearchParams(location.search);
			const timestamp = searchParams.get('t');
			setRandomSeed(timestamp ? parseInt(timestamp, 10) : Date.now());
		}
	}, [sort, location.search]);

	if ((!sortedStatements || sortedStatements.length === 0) && isQuestion) {
		return (
			<EmptyScreen statement={statement} />
		);
	}

	if (!statement) return null;

	const isSubmitMode = statement.statementSettings?.isSubmitMode;

	const handleSubmit = () => {
		navigate(`/statement/${statementId}/thank-you`);
	};

	return (
		<>
			<Flipper
				flipKey={flipKey}
				spring={{ stiffness: 300, damping: 30 }}
				className={styles['suggestions-wrapper']}
			>
				{sortedStatements.map((statementSub: Statement) => (
					<Flipped key={statementSub.statementId} flipId={statementSub.statementId}>
						<div className={styles['card-wrapper']}>
							<SuggestionCard
								parentStatement={statement}
								statement={statementSub}
							/>
						</div>
					</Flipped>
				))}
			</Flipper>
			{isSubmitMode && (
				<div className={styles.submitButtonContainer}>
					<button
						onClick={handleSubmit}
						className={styles.submitButton}
					>
						{t('Submit your vote')}
					</button>
				</div>
			)}
		</>
	);
};

export default SuggestionCards;
