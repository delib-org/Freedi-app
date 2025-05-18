import { FC, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { sortSubStatements } from '../../statementsEvaluationCont';
import SuggestionCard from './suggestionCard/SuggestionCard';
import styles from './SuggestionCards.module.scss';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import { Statement, SortType, SelectionFunction } from 'delib-npm';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
} from '@/redux/statements/statementsSlice';

import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';

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
	const prevSubStatementsRef = useRef<Statement[]>([]);
	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));

	const [totalHeight, setTotalHeight] = useState(0);

	const _subStatements = useSelector(
		statementOptionsSelector(statement?.statementId)
	);

	const subStatements =
		propSubStatements ||
		(selectionFunction
			? _subStatements.filter(
				(sub: Statement) =>
					sub.evaluation.selectionFunction === selectionFunction
			)
			: _subStatements);

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
	}, [sort]);

	useEffect(() => {

		if (sort !== SortType.accepted) return;

		const prevSubStatements = prevSubStatementsRef.current;
		// Now you can compare prevSubStatements with current subStatements
		// For example, check if the array has changed
		if (prevSubStatements && hasOrderChanged(prevSubStatements, subStatements)) {

			// Do something with prevSubStatements if needed
			const { totalHeight: _totalHeight } = sortSubStatements(
				subStatements,
				sort,
				30
			);
			setTotalHeight(_totalHeight);
		}

		// Update the ref with current value for next render
		prevSubStatementsRef.current = subStatements;
	}, [subStatements]);

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

	function hasOrderChanged(originalArray: Statement[], newArray: Statement[]) {
		if (originalArray.length !== newArray.length) return true;

		const _originalArray = originalArray.sort((a, b) => a.consensus - b.consensus);
		const _newArray = newArray.sort((a, b) => a.consensus - b.consensus);

		return _originalArray.some((item, index) => item.statementId !== _newArray[index].statementId);
	}

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
