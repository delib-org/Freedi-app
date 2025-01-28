import { listenToStatement } from "@/controllers/db/statements/listenToStatements";
import { statementSelector } from "@/model/statements/statementsSlice";
import { Statement } from "delib-npm";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { Unsubscribe } from "firebase/firestore";

export function useStageVM(): { stage: Statement | undefined, parentStatement: Statement | undefined } {
	const { stageId } = useParams<{ stageId: string }>();
	const statement = useSelector(statementSelector(stageId));
	const parentStatement = useSelector(statementSelector(statement?.parentId));

	useEffect(() => {
		let unsubscribe: Unsubscribe = () => { };
		if (!statement) {
			unsubscribe = listenToStatement(stageId);
		}

		return () => {
			unsubscribe();
		}
	}, [statement?.statementId]);

	useEffect(() => {
		let unsubscribe: Unsubscribe = () => { };
		if (statement && !parentStatement) {
			unsubscribe = listenToStatement(statement.parentId);
		}
		return () => {
			unsubscribe();
		}
	}, [parentStatement?.statementId, statement?.statementId]);





	try {
		if (!stageId) throw new Error("No stageId found in URL");

		return { stage: statement, parentStatement };
	} catch (error) {
		console.error(error);
		return { stage: undefined, parentStatement: undefined };
	}
}