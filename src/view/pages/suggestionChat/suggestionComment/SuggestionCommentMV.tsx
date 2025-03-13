import { listenToEvaluation } from "@/controllers/db/evaluation/getEvaluation";
import { evaluationSelector } from "@/redux/evaluations/evaluationsSlice";
import { Statement } from "delib-npm";
import { useEffect } from "react";
import { useSelector } from "react-redux";

interface Props {
	parentStatement: Statement;
	statement: Statement;
}

export function useSuggestionComment({ parentStatement, statement }: Props) {
	//get user evaluation
	const creator = statement.creator;
	const evaluationNumber: number | undefined = useSelector(evaluationSelector(parentStatement.statementId, creator?.uid));

	useEffect(() => {

		const unsubscribe = listenToEvaluation(parentStatement.statementId, creator?.uid);

		return () => unsubscribe();
	}, [creator?.uid]);

	return { evaluationNumber };
}