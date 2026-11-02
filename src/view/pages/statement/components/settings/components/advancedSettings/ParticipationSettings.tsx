import { FC } from 'react';
import { Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { Lightbulb, MessageCircle } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import ToggleSwitch from './ToggleSwitch';

interface ParticipationSettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
	/**
	 * The Host hub's hero no longer carries "Discussion chat", so the hub
	 * renders it here; the legacy page keeps it in the hero.
	 */
	showChatToggle?: boolean;
}

const ParticipationSettings: FC<ParticipationSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
	showChatToggle = false,
}) => {
	const { t } = useTranslation();

	function handleRequireSolutionToggle(enabled: boolean) {
		setStatementSettingToDB({
			statement,
			property: 'askUserForASolutionBeforeEvaluation',
			newValue: enabled,
			settingsSection: 'questionSettings',
		});
	}

	return (
		<>
			{/* Joining answers, the join form, conditional joining and the
			    activation threshold live in People > Joining answers & rooms. */}
			{statement.statementType === StatementType.question && (
				<ToggleSwitch
					isChecked={statement.questionSettings?.askUserForASolutionBeforeEvaluation ?? false}
					onChange={handleRequireSolutionToggle}
					label={t('Ask for their own idea first')}
					description={t('Participants must suggest before they can rate others')}
					icon={Lightbulb}
				/>
			)}
			{/* "Allow participants to add answers" (both enableAdd* flags) is ONE
			    control: in the hero on the legacy page, in Live now on the hub. */}
			{showChatToggle && (
				<ToggleSwitch
					isChecked={settings.hasChat ?? false}
					onChange={(checked) => handleSettingChange('hasChat', checked)}
					label={t('Discussion chat')}
					description={t('Let participants discuss the question and comment on each option')}
					icon={MessageCircle}
				/>
			)}
		</>
	);
};

export default ParticipationSettings;
