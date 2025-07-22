import { FC, useEffect, useState } from 'react';
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

interface Props {
	propSort?: SortType;
	selectionFunction?: SelectionFunction;
	subStatements?: Statement[];
}

const SuggestionCards: FC<Props> = ({
	propSort,
	selectionFunction,
	subStatements: propSubStatements,
}) => {
	const { sort: sortFromUrl, statementId } = useParams();

	const sort = propSort || sortFromUrl || SortType.newest;

	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));

	const [totalHeight, setTotalHeight] = useState(0);

	const statementsFromStore = useSelector(
		statementOptionsSelector(statement?.statementId)
	);

	// Check if user is admin
	const isAdmin = 
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;

	// Filter statements based on visibility and permissions
	const visibleStatements = statementsFromStore.filter(st => 
		st.hide !== true || st.creatorId === creator?.uid || isAdmin
	);

	const subStatements =
		propSubStatements ||
		(selectionFunction
			? visibleStatements.filter(
				(sub: Statement) =>
					sub.evaluation.selectionFunction === selectionFunction
			)
			: visibleStatements);

	useEffect(() => {
		if (!statement && statementId)
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement))
			);
	}, [statement, statementId, dispatch]);

	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		return () => unsubscribe();
	}, [statementId]);

	useEffect(() => {
		const { totalHeight: _totalHeight } = sortSubStatements(
			subStatements,
			sort,
			30
		);
		setTotalHeight(_totalHeight);
	}, [sort]);

	useEffect(() => {
		const _totalHeight = subStatements.reduce(
			(acc: number, sub: Statement) => {
				return acc + (sub.elementHight ?? 200) + 30;
			},
			0
		);
		setTotalHeight(_totalHeight);
		sortSubStatements(subStatements, sort, 30);
	}, [subStatements.length, sort]);

	if (!subStatements || subStatements.length === 0) {
		return (
			<EmptyScreen
				setShowModal={() => {
					return;
				}}
			/>
		);
	}

	if (!statement) return null;

	return (
		<div
			className={styles['suggestions-wrapper']}
			style={{ height: `${totalHeight + 60}px` }}
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