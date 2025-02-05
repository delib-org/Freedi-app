import CustomSwitchSmall from "@/view/components/switch/customSwitchSmall/CustomSwitchSmall";
import { StatementType } from "delib-npm";
import { FC } from "react";
import { StatementSettingsProps } from "../../settingsTypeHelpers";
import SectionTitle from "../sectionTitle/SectionTitle";
import { useLanguage } from "@/controllers/hooks/useLanguages";
import "./QuestionSettings.scss";

//icons
import DocumentIcon from "@/assets/icons/document.svg?react";
import SimpleIcon from "@/assets/icons/navQuestionsIcon.svg?react";

import { setStatementSettingToDB } from "@/controllers/db/statementSettings/setStatementSettings";

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
				property: "isDocument",
				newValue: isDocument,
				settingsSection: "questionSettings",
			});
		}

		return (
			<div className="question-settings">
				<SectionTitle title="Question Settings" />

				<CustomSwitchSmall
					label="Document Question"
					checked={questionSettings?.isDocument || false}
					setChecked={handleSetDocumentQuestion}
					textChecked={t("Document Question")}
					imageChecked={<DocumentIcon />}
					imageUnchecked={<SimpleIcon />}
					textUnchecked={t("Simple Question")}
				/>
			</div>
		);

	} catch (error: unknown) {
		console.error(error);

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
