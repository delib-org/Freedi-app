import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import './QuestionSettings.scss';
import { setQuestionTypeToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { QuestionType, StatementType } from '@/types/TypeEnums';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import DocumentIcon from '@/assets/icons/paper.svg?react';
import SimpleIcon from '@/assets/icons/navQuestionsIcon.svg?react';

const QuestionSettings: FC<StatementSettingsProps> = ({
	statement,
	// setStatementToEdit,
}) => {
	const { t } = useLanguage();
	try {
		const { questionSettings } = statement;
		if (statement.statementType !== StatementType.question) return null;

		function handleQuestionType(isDocument: boolean) {
			setQuestionTypeToDB({
				statement,
				questionType: isDocument
					? QuestionType.multiStage
					: QuestionType.massConsensus,
			});
		}

		return (
			<div className='question-settings'>
				<SectionTitle title='Question Settings' />

				<CustomSwitchSmall
					label='Document Question'
					checked={
						questionSettings?.questionType ===
							QuestionType.multiStage || false
					}
					setChecked={handleQuestionType}
					textChecked={t('Document Question')}
					imageChecked={<DocumentIcon />}
					imageUnchecked={<SimpleIcon />}
					textUnchecked={t('Simple Question')}
				/>
			</div>
		);
	} catch (error: unknown) {
		console.error(error);

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
