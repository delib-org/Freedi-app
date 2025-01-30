import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import './QuestionSettings.scss';
import DocumentIcon from '@/assets/icons/document.svg?react';
import SimpleIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementType } from '@/types/enums';

const QuestionSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useLanguage();
	const { questionSettings } = statement;

	if (statement.statementType !== StatementType.question) return null;

	function handleSetDocumentQuestion(isDocument: boolean) {
		setStatementSettingToDB({
			statement,
			property: 'isDocument',
			newValue: isDocument,
			settingsSection: 'questionSettings',
		});
	}

	return (
		<div className='question-settings'>
			<SectionTitle title='Question Settings' />

			<CustomSwitchSmall
				label='Document Question'
				checked={questionSettings?.isDocument || false}
				setChecked={handleSetDocumentQuestion}
				textChecked={t('Document Question')}
				imageChecked={<DocumentIcon />}
				imageUnchecked={<SimpleIcon />}
				textUnchecked={t('Simple Question')}
			/>
		</div>
	);
};

export default QuestionSettings;
