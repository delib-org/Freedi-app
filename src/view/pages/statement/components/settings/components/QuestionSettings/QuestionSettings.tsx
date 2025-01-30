import { StatementType } from "delib-npm";
import { FC } from "react";
import { StatementSettingsProps } from "../../settingsTypeHelpers";
import SectionTitle from "../sectionTitle/SectionTitle";
import "./QuestionSettings.scss";

import QuestionSelector from "@/view/components/questionSelector/QuestionSelector";

const QuestionSettings: FC<StatementSettingsProps> = ({
	statement,
	// setStatementToEdit,
}) => {
	if (statement.statementType !== StatementType.question) return null;

	return (
		<div className="question-settings">
			<SectionTitle title="Question Settings" />

			<QuestionSelector />
		</div>
	);
};

export default QuestionSettings;
