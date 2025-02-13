import { listenToStatement } from "@/controllers/db/statements/listenToStatements";
import { statementSelector } from "@/redux/statements/statementsSlice";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router";
import { Unsubscribe } from "firebase/firestore";
import { Statement } from "@/types/statement/statementTypes";

export function useStageVM(): { stage: Statement | undefined, parentStatement: Statement | undefined } {
	const { statementId } = useParams<{ statementId: string }>();

	const statement = useSelector(statementSelector(statementId));
	const parentStatement = useSelector(statementSelector(statement?.parentId));

	useEffect(() => {
		let unsubscribe: Unsubscribe = () => { return; };
		if (!statement) {
			unsubscribe = listenToStatement(statementId);
		}

		return () => {
			unsubscribe();
		}
	}, [statement?.statementId]);

	useEffect(() => {
		let unsubscribe: Unsubscribe = () => { return; };
		if (statement && !parentStatement) {
			unsubscribe = listenToStatement(statement.parentId);
		}

		return () => {
			unsubscribe();
		}
	}, [parentStatement?.statementId, statement?.statementId]);

	try {
		if (!statementId) throw new Error("No statementId found in URL");

		return { stage: statement, parentStatement };
	} catch (error) {
		console.error(error);

		return { stage: undefined, parentStatement: undefined };
	}
}