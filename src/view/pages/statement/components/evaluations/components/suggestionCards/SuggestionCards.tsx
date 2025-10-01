import { FC, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useLocation } from 'react-router';

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

	// Memoize statementId to prevent unnecessary effect re-runs
	const statementId = useMemo(() => params.statementId, [params.statementId]);
	const sort = propSort || params.sort || SortType.newest;

	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));
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
			setRandomSeed(Date.now());
		}
	}, [sort]);

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

	// Memoize the sort operation to prevent unnecessary recalculations
	useEffect(() => {
		// Only calculate if we have subStatements
		if (!subStatements || subStatements.length === 0) {
			setTotalHeight(0);
			return;
		}

		// Calculate heights and sort substatements
		const { totalHeight: _totalHeight } = sortSubStatements(
			subStatements,
			sort,
			30,
			randomSeed
		);
		setTotalHeight(_totalHeight);
	}, [subStatementsKey, heightsKey, sort, randomSeed]); // Use stable keys instead of array reference

	if (!subStatements || subStatements.length === 0) {
		return (
			<EmptyScreen statement={statement}/>
		);
	}

	if (!statement) return null;

	return (
		<div
			className={styles['suggestions-wrapper']}
			style={{ height: `${totalHeight}px` }}
		>
			{subStatements?.map((statementSub: Statement) => {
				return (
					<SuggestionCard
						key={statementSub.statementId}
						parentStatement={statement}
						siblingStatements={subStatements}
						statement={statementSub}
					/>
				);
			})}
		</div>
	);
};

export default SuggestionCards;