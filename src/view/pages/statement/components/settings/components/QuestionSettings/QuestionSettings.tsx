import CustomSwitchSmall from "@/view/components/switch/customSwitchSmall/CustomSwitchSmall";
import { QuestionType, StatementType } from "delib-npm";
import { FC } from "react";
import { StatementSettingsProps } from "../../settingsTypeHelpers";
import SectionTitle from "../sectionTitle/SectionTitle";
import { useLanguage } from "@/controllers/hooks/useLanguages";
import "./QuestionSettings.scss";

//icons
import DocumentIcon from "@/assets/icons/document.svg?react";
import SimpleIcon from "@/assets/icons/navQuestionsIcon.svg?react";

import { setStatementSettingToDB } from "@/controllers/db/statementSettings/setStatementSettings";
import QuestionSelector from "@/view/components/questionSelector/QuestionSelector";

const QuestionSettings: FC<StatementSettingsProps> = ({
	statement,
	// setStatementToEdit,
}) => {
	const { t } = useLanguage();

	if (statement.statementType !== StatementType.question) return null;

	try {
		const { questionSettings } = statement;

		function handleSetDocumentQuestion(isDocument: boolean) {

			setStatementSettingToDB({
				statement,
				property: "questionType",
				newValue: isDocument ? QuestionType.document : QuestionType.simple,
				settingsSection: "questionSettings",
			});
		}

		return (
			<div className="question-settings">
				<SectionTitle title="Question Settings" />

				<QuestionSelector />
			</div>
		);

	} catch (error: unknown) {
		console.error(error);

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
