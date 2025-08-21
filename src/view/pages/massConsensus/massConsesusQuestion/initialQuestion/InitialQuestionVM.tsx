import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import { setSimilarStatements } from "@/redux/massConsensus/massConsensusSlice";
import { statementSubscriptionSelector } from "@/redux/statements/statementsSlice";
import { similarOptionsEndPoint } from "@/services/similarOptions";
import { StatementSubscription } from "delib-npm";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router";

interface InitialQuestionVM {
  handleSetInitialSuggestion: () => Promise<void>;
  ifButtonEnabled: boolean;
  ready: boolean;
  subscription: StatementSubscription | undefined;
  error?: { blocking: boolean; message: string };
}

export function useInitialQuestion(description: string): InitialQuestionVM {
  const dispatch = useDispatch();
  const { statementId } = useParams<{ statementId: string }>();
  const { creator } = useAuthentication();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<
    { blocking: boolean; message: string } | undefined
  >();
  const subscription = useSelector(statementSubscriptionSelector(statementId));

  const ifButtonEnabled = useMemo(
    () => description.trim().length > 0,
    [description]
  );

  // Clear non-blocking errors when description changes
  useEffect(() => {
    setReady(false);

    if (error && !error.blocking) {
      setError(undefined);
    }
  }, [description]);

  async function handleSetInitialSuggestion() {
    try {
      if (!ifButtonEnabled) return;

      // Clear any previous non-blocking errors before making a new request
      if (error && !error.blocking) {
        setError(undefined);
      }

      const creatorId = creator.uid;
      const result = await getSimilarStatements(
        statementId,
        description,
        creatorId,
        setError
      );

      // Check for current error state after the request
      if (!result || error) return;

      const { similarStatements = [], similarTexts = [], userText } = result;
      dispatch(
        setSimilarStatements([
          ...[userText],
          ...similarTexts,
          ...similarStatements,
        ])
      );
      setReady(true);
    } catch (error) {
      console.error(error);
    }
  }

  return {
    handleSetInitialSuggestion,
    ifButtonEnabled,
    ready,
    error,
    subscription,
  };
}

async function getSimilarStatements(
  statementId: string,
  userInput: string,
  creatorId: string,
  setError: (error: { blocking: boolean; message: string } | undefined) => void
) {
  try {
    const endPoint = similarOptionsEndPoint;
    const response = await fetch(endPoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statementId,
        userInput,
        creatorId,
        generateIfNeeded: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 403) {
        setError({ blocking: true, message: errorData.error });
        throw new Error(errorData.error ?? "Server error");
      }
      if (response.status === 400) {
        setError({ blocking: false, message: errorData.error });

        return null; // Return null to indicate error but don't throw
      }
    }

    const data = await response.json();
    if (!data) throw new Error("No data returned from server");

    const { similarStatements, similarTexts = [], userText } = data;
    const _userText = userText.statementId
      ? userText
      : { statement: userText, statementId: null };
    const _similarTexts = similarTexts.map((text: string) => ({
      statement: text,
      statementId: null,
    }));

    return {
      similarStatements,
      similarTexts: _similarTexts,
      userText: _userText,
    };
  } catch (error) {
    console.error("Error:", error);

    return null;
  }
}
