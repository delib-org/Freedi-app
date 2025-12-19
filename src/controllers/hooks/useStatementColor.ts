import { StatementType, Statement } from "delib-npm";
import { useEffect, useState } from "react";

export interface StyleProps {
  backgroundColor: string;
  color: string;
}

export default function useStatementColor({
  statement,
}: {
  statement: Statement | undefined;
}): StyleProps {
  const initStyle = {
    backgroundColor: "var(--header-home)",
    color: "white",
  };

  const [style, setStyle] = useState(initStyle);

  // Only run the effect when the `statement` is available
  // Note: Selection state (isVoted/isChosen) is now determined by parent's results array,
  // not individual statement flags. This hook only handles type-based styling.
  useEffect(() => {
    if (!statement) return;
    const { statementType } = statement;
    if (statementType === StatementType.group) {
      setStyle({
        backgroundColor: "var(--header-group)", // Purple shade for group type
        color: "var(--group-text, #ffffff)", // Text color for group (white)
      });
    } else if (statementType === StatementType.option) {
      setStyle({
        backgroundColor: "var(--header-not-chosen, #123abc)", // Custom option color
        color: "var(--option-text, #ffffff)", // Text color for options
      });
    } else if (statementType === StatementType.question) {
      setStyle({
        backgroundColor: "var(--header-question, #123def)", // Custom question color
        color: "var(--question-text, #fff)", // Text color for questions
      });
    } else {
      // Default colors
      setStyle(initStyle);
    }
  }, [statement]);

  return style;
}
