import { listenToStatement } from "@/controllers/db/statements/listenToStatements";
import { statementSelector } from "@/redux/statements/statementsSlice";
import { Statement } from "delib-npm";
import { useEffect } from "react";
import { useSelector } from "react-redux";

export function useEvaluation(statement: Statement | undefined) {
	const parentId = statement?.parentId;
	const parentStatement = useSelector(statementSelector(parentId));

	useEffect(() => {
		// Don't create listener if:
		// 1. No parentId
		// 2. Parent already in store
		if (!parentId || parentStatement) return;

		const unsubscribe = listenToStatement(parentId);

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [parentId, parentStatement?.statementId]);

	return { parentStatement };
}