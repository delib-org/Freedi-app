import { setEvaluationToDB } from "@/controllers/db/evaluation/setEvaluation";
import { getStatementFromDB } from "@/controllers/db/statements/getStatement";
import { listenToAllSubStatements } from "@/controllers/db/statements/listenToStatements";
import {
  createStatement,
  setStatementToDB,
} from "@/controllers/db/statements/setStatements";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";

import {
  QuestionType,
  Statement,
  StatementType,
} from "delib-npm";
import { useEffect } from "react";

import { useParams } from "react-router";

export function useSimilarSuggestions(statementId: string | undefined, nextStep: string | undefined) {
  const { statementId: parentId } = useParams<{ statementId: string }>();
  const { creator, isLoading } = useAuthentication();

  useEffect(() => {
    if (!parentId) return;

    const unsubscribe = listenToAllSubStatements(parentId);

    return () => unsubscribe();
  }, [parentId]);
  async function handleSetSuggestionToDB(
    statement: Statement | null
  ): Promise<boolean> {
    try {
      if (isLoading || !creator || !statement) return false;

      const parentStatement = await getStatementFromDB(parentId);
      if (!parentStatement)
        throw new Error("Error getting parent statement from DB");

      //if statementId === null save new to DB
      if (!statement?.statementId) {
        const newStatement: Statement = createStatement({
          text: statement.statement,
          parentStatement,
          statementType: StatementType.option,
          questionType: QuestionType.massConsensus,
        });
        const { statementId: newStatementId } = await setStatementToDB({
          statement: newStatement,
          parentStatement,
        });
        if (!newStatementId) throw new Error("Error saving statement to DB");
        await setEvaluationToDB(newStatement, creator, 1);
      } else {
        const newStatement = statement as Statement;
        //if statementId !== null evaluate +1 the statement
        await setEvaluationToDB(newStatement, creator, 1);
      }

      // Don't navigate here - let the parent component handle navigation after showing feedback
      return true;
    } catch (error) {
      console.error(error);

      return false;
    }
  }

  return {
    handleSetSuggestionToDB,
    isLoading,
    nextStep,
  };
}
