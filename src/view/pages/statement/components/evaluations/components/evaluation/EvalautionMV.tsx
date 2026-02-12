import { listenToStatement } from "@/controllers/db/statements/listenToStatements";
import { statementSelector } from "@/redux/statements/statementsSlice";
import { Statement } from "@freedi/shared-types";
import { useEffect } from "react";
import { useSelector } from "react-redux";

export function useEvaluation(statement: Statement | undefined) {
	const parentStatement = useSelector(statementSelector(statement?.parentId));

	useEffect(() => {
		const unsubscribe = parentStatement ? () => { return; }
			:
			listenToStatement(statement.parentId);

		return () => unsubscribe();
	}, [parentStatement?.statementId]);

	return { parentStatement };

}