import { FC, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { sortSubStatements } from '../../statementsEvaluationCont';
import SuggestionCard from './suggestionCard/SuggestionCard';
import styles from './SuggestionCards.module.scss';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import { Statement } from '@/types/statement/Statement';
import { SortType, StatementType } from '@/types/TypeEnums';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementSelector,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import { SelectionFunction } from '@/types/evaluation/Evaluation';

interface Props {
	propSort?: SortType;
	selectionFunction?: SelectionFunction;
	subStatements?: Statement[];
}

const SuggestionCards: FC<Props> = ({ propSort, selectionFunction, subStatements: propSubStatements }) => {
	const { sort: _sort, statementId } = useParams();
	const sort = propSort || _sort || SortType.accepted;
	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));

	const [totalHeight, setTotalHeight] = useState(0);

	const _subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	).filter((sub: Statement) => sub.statementType === StatementType.option);

	const subStatements = propSubStatements ? propSubStatements : selectionFunction
		? _subStatements.filter(
			(sub: Statement) =>
				sub.evaluation.selectionFunction === selectionFunction
		)
		: _subStatements;

	useEffect(() => {
		if (!statement)
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement))
			);
	}, [statement]);

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
			style={{ height: `${totalHeight + 100}px` }}
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
