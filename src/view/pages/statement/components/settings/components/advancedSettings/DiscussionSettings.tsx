import { FC } from 'react';
import { Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { Lightbulb, Shield } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ToggleSwitch from './ToggleSwitch';

interface DiscussionSettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
}

const DiscussionSettings: FC<DiscussionSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	if (statement.statementType !== StatementType.question) {
		return null;
	}

	return (
		<>
			<ToggleSwitch
				isChecked={settings.popperianDiscussionEnabled ?? false}
				onChange={(checked) => handleSettingChange('popperianDiscussionEnabled', checked)}
				label={t('Popper-Hebbian Mode')}
				description={t('Evidence-based discussion with support/challenge format')}
				icon={Lightbulb}
				badge="new"
			/>
			{settings.popperianDiscussionEnabled && (
				<ToggleSwitch
					isChecked={settings.popperianPreCheckEnabled ?? false}
					onChange={(checked) => handleSettingChange('popperianPreCheckEnabled', checked)}
					label={t('AI Pre-Check')}
					description={t('AI reviews and refines options before posting')}
					icon={Shield}
				/>
			)}
		</>
	);
};

export default DiscussionSettings;
