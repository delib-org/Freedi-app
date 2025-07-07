import { FC, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { sortSubStatements } from '../../statementsEvaluationCont';
import SuggestionCard from './suggestionCard/SuggestionCard';
import styles from './SuggestionCards.module.scss';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import { Statement, SortType, SelectionFunction, Role } from 'delib-npm';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';

import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { creatorSelector } from '@/redux/creator/creatorSlice';

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
	const { sort: _sort, statementId } = useParams();

	const sort = propSort || _sort || SortType.newest;
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const isAdmin = creator?.uid === parentSubscription?.statement?.creatorId || parentSubscription?.role === Role.admin;

	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));

	const [totalHeight, setTotalHeight] = useState(0);

	const _subStatements = useSelector(
		statementOptionsSelector(statement?.statementId)
	);

	const sortedSubStatementIds = _subStatements.sort((a, b) => a.consensus - b.consensus).map((sub: Statement) => sub.statementId).join("");

	const subStatements =
		(propSubStatements ||
			(selectionFunction
				? _subStatements.filter(
					(sub: Statement) =>
						sub.evaluation.selectionFunction === selectionFunction
				)
				: _subStatements)).filter(sub => sub.hide !== true || sub.creatorId === creator?.uid || isAdmin) || [];

	useEffect(() => {
		if (!statement && statementId)
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement))
			);
	}, [statement, statementId]);

	useEffect(() => {

		const unsubscribe = listenToEvaluations(statementId);

		return () => unsubscribe();
	}, [])

	useEffect(() => {
		const { totalHeight: _totalHeight } = sortSubStatements(
			subStatements,
			sort,
			30
		);
		setTotalHeight(_totalHeight);
	}, [sort, sortedSubStatementIds]);

	useEffect(() => {
		const _totalHeight = subStatements.reduce(
			(acc: number, sub: Statement) => {
				return acc + (sub.elementHight ?? 200) + 30;
			},
			0
		);
		setTotalHeight(_totalHeight);
		sortSubStatements(subStatements, sort, 30);
	}, [subStatements.length]);

	if (!subStatements) {
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
