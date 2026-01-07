import { useContext,  useState } from "react";

import { StatementContext } from "../../StatementCont";
import styles from "./Switch.module.scss";
import { Role } from "delib-npm";
import SwitchScreen from "./SwitchScreen";
import { updateStatementText } from "@/controllers/db/statements/setStatements";
import { useAuthorization } from "@/controllers/hooks/useAuthorization";
import OnlineUsers from "../nav/online/OnlineUsers";
import SubQuestionsMap from "../subQuestionsMap/SubQuestionsMap";
import ChatPanel from "../chat/components/chatPanel/ChatPanel";
import { renderInlineMarkdown } from "@/helpers/inlineMarkdownHelpers";

const Switch = () => {
  const { statement } = useContext(StatementContext);
  const { role } = useAuthorization(statement?.statementId);
  const isAdmin = role === Role.admin || role === Role.creator;

  const [edit, setEdit] = useState(false);

  function handleUpdateStatement(e) {
    if (e.key === "Enter") {
      const title = e.target.value;

      updateStatementText(statement, title);
      setEdit(false);
    }
  }

  function handleStartEdit() {
    if (isAdmin) {
      setEdit(true);
    }
  }

  return (
    <main className="page__main">
      {isAdmin ? (
        <button className={styles.header} onClick={handleStartEdit}>
          {!edit ? (
            <h1>{renderInlineMarkdown(statement?.statement)}</h1>
          ) : (
            <h1>
              <input
                type="text"
                defaultValue={statement?.statement}
                onBlur={() => setEdit(false)}
                onKeyUp={handleUpdateStatement}
              />
            </h1>
          )}
        </button>
      ) : (
        <div className={styles.header}>
          <h1>{renderInlineMarkdown(statement?.statement)}</h1>
        </div>
      )}

      <OnlineUsers statementId={statement?.statementId} />
      {statement && <SubQuestionsMap statement={statement} />}
      <ChatPanel />
      <SwitchScreen statement={statement} role={role} />
    </main>
  );
};

export default Switch;
