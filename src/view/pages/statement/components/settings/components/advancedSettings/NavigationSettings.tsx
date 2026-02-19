import { FC } from 'react';
import { Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { Plus, Navigation } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ToggleSwitch from './ToggleSwitch';

interface NavigationSettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
}

const NavigationSettings: FC<NavigationSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	return (
		<>
			{statement.statementType === StatementType.question && (
				<ToggleSwitch
					isChecked={settings.enableAddNewSubQuestionsButton ?? false}
					onChange={(checked) => handleSettingChange('enableAddNewSubQuestionsButton', checked)}
					label={t('Sub-Questions Button')}
					description={t('Show button to create nested questions')}
					icon={Plus}
				/>
			)}
			<ToggleSwitch
				isChecked={settings.enableNavigationalElements ?? false}
				onChange={(checked) => handleSettingChange('enableNavigationalElements', checked)}
				label={t('Navigation Elements')}
				description={t('Display breadcrumbs and navigation aids')}
				icon={Navigation}
			/>
		</>
	);
};

export default NavigationSettings;
