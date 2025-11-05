import { FC, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation, useNavigate } from 'react-router';

import { Statement, SortType, SelectionFunction, Role, StatementType } from 'delib-npm';

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
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SuggestionCards.module.scss';

interface Props {
	propSort?: SortType | string;
	selectionFunction?: SelectionFunction;
	subStatements?: Statement[];
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

	const [totalHeight, setTotalHeight] = useState(0);
	const [randomSeed, setRandomSeed] = useState(Date.now());

	const statementsFromStore = useSelector(
		statementOptionsSelector(statement?.statementId)
	);

	// Check if user is admin
	const isAdmin =
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;

	// Memoize filtered statements to prevent unnecessary recalculations
	const visibleStatements = useMemo(() =>
		statementsFromStore.filter(st =>
			st.hide !== true || st.creatorId === creator?.uid || isAdmin
		),
		[statementsFromStore, creator?.uid, isAdmin]
	);

	// Memoize subStatements to prevent unnecessary recalculations
	const subStatements = useMemo(() =>
		propSubStatements ||
		(selectionFunction
			? visibleStatements.filter(
				(sub: Statement) =>
					sub.evaluation.selectionFunction === selectionFunction
			)
			: visibleStatements),
		[propSubStatements, selectionFunction, visibleStatements]
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

	// Create a stable key from statement IDs to prevent infinite loops
	const subStatementsKey = useMemo(() =>
		subStatements.map(s => s.statementId).sort().join(','),
		[subStatements]
	);

	// Create a key that includes heights to trigger re-sort when heights change
	const heightsKey = useMemo(() =>
		subStatements.map(s => `${s.statementId}:${s.elementHight || 0}`).sort().join(','),
		[subStatements]
	);

	// Create a key that includes consensus values to trigger re-sort when evaluations change
	const consensusKey = useMemo(() => {
		if (sort === SortType.accepted) {
			// Check if using single-like evaluation type
			const isSingleLike = statement?.statementSettings?.evaluationType === 'single-like';

			if (isSingleLike) {
				// Track sumPro (likes) for single-like evaluation
				return subStatements.map(s => `${s.statementId}:${s.evaluation?.sumPro || s.pro || 0}`).sort().join(',');
			} else {
				// Track consensus for other evaluation types
				return subStatements.map(s => `${s.statementId}:${s.consensus || 0}`).sort().join(',');
			}
		}

		return ''; // Don't track for other sort types
	}, [subStatements, sort, statement?.statementSettings?.evaluationType]);

	// Create a key that includes dates to trigger re-sort when statements are updated
	const datesKey = useMemo(() => {
		if (sort === SortType.newest) {
			return subStatements.map(s => `${s.statementId}:${s.createdAt}`).sort().join(',');
		} else if (sort === SortType.mostUpdated) {
			return subStatements.map(s => `${s.statementId}:${s.lastUpdate}`).sort().join(',');
		}

		return ''; // Don't track for other sort types
	}, [subStatements, sort]);

	// Memoize the sort operation to prevent unnecessary recalculations
	useEffect(() => {
		// Only calculate if we have subStatements
		if (!subStatements || subStatements.length === 0) {
			setTotalHeight(0);

			return;
		}

		// Calculate heights and sort sub-statements
		const { totalHeight: _totalHeight } = sortSubStatements(
			subStatements,
			sort,
			30,
			randomSeed,
			statement
		);
		setTotalHeight(_totalHeight);
	}, [subStatementsKey, heightsKey, consensusKey, datesKey, sort, randomSeed, statement]); // Use stable keys instead of array reference

	if ((!subStatements || subStatements.length === 0) && isQuestion) {
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
			<div
				className={styles['suggestions-wrapper']}
				style={{ height: `${totalHeight}px` }}
			>
				{subStatements?.map((statementSub: Statement) => {
					return (
						<SuggestionCard
							key={statementSub.statementId}
							parentStatement={statement}
							statement={statementSub}
						/>
					);
				})}
			</div>
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