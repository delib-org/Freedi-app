import { FC, useContext, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import { sortSubStatements } from "../../statementsEvaluationCont";
import SuggestionCard from "./suggestionCard/SuggestionCard";
import styles from "./SuggestionCards.module.scss";
import { statementSubsSelector } from "@/redux/statements/statementsSlice";
import { StatementContext } from "@/view/pages/statement/StatementCont";
import EmptyScreen from "../emptyScreen/EmptyScreen";
import { Statement } from "@/types/statement/statementTypes";
import { StatementType } from "@/types/enums";

interface Props {
	randomSubStatements?: Statement[];
}

const SuggestionCards: FC<Props> = ({ randomSubStatements }) => {
	const { sort } = useParams();
	const { statement } = useContext(StatementContext);

	const [totalHeight, setTotalHeight] = useState(0);

	// const subStatements = useSelector(statementSubsSelector(statement?.statementId)).filter((sub: Statement) => sub.statementType === StatementType.option);

	const reduxSubStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	).filter((sub: Statement) => sub.statementType === StatementType.option);

	const subStatements = useMemo(
		() => randomSubStatements ?? reduxSubStatements,
		[randomSubStatements, reduxSubStatements]
	);

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

	subStatements.forEach(statement => {
		console.log(statement.statement)
	});

	return (
		<div
			className={styles['suggestions-wrapper']}
			style={{ height: `${totalHeight + 100}px` }}
		>
			{subStatements?.map((statementSub: Statement) => {
				return (
					<SuggestionCard
						key={statementSub.statementId}
						parentStatement={randomSubStatements ? statementSub : statement}
						siblingStatements={subStatements}
						statement={statementSub}
					/>
				);
			})}
		</div>
	);
};

export default SuggestionCards;
