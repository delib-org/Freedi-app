import { FC, useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router";
import { sortSubStatements } from "../../statementsEvaluationCont";
import SuggestionCard from "./suggestionCard/SuggestionCard";
import styles from "./SuggestionCards.module.scss";
import { setStatement, statementSelector, statementSubsSelector } from "@/redux/statements/statementsSlice";
import { StatementContext } from "@/view/pages/statement/StatementCont";
import EmptyScreen from "../emptyScreen/EmptyScreen";
import { Statement } from "@/types/statement";
import { StatementType } from "@/types/enums";
import { getStatementFromDB } from "@/controllers/db/statements/getStatement";

interface Props{
	outerSubStatement?: Statement[];
}

const SuggestionCards: FC<Props> = ({outerSubStatement}) => {
	const { sort, statementId } = useParams();
	const dispatch = useDispatch();
	//const { statement } = useContext(StatementContext);
	const statement = useSelector(statementSelector(statementId))
	console.log(statement)

	
	const [totalHeight, setTotalHeight] = useState(0);

	const subStatements = outerSubStatement? outerSubStatement : useSelector(statementSubsSelector(statement?.statementId)).filter((sub: Statement) => sub.statementType === StatementType.option);

	useEffect(() => {
		if (!statement) getStatementFromDB(statementId).then((statement: Statement) => dispatch(setStatement(statement)))
	},([statement]))

	useEffect(() => {
		const { totalHeight: _totalHeight } = sortSubStatements(
			subStatements,
			sort,
			30
		);
		setTotalHeight(_totalHeight);
	}, [sort]);

	useEffect(() => {
		const _totalHeight = subStatements.reduce((acc: number, sub: Statement) => {
			return acc + (sub.elementHight ?? 200) + 30;
		}, 0);
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
	
	if (!statement) return null

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
