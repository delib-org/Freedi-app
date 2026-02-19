import { FC } from 'react';
import { Statement, StatementSettings } from '@freedi/shared-types';
import { EyeOff, MessageCircle, GitBranch, Radio, FileText, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getSignDocumentUrl } from '@/utils/urlHelpers';
import styles from './EnhancedAdvancedSettings.module.scss';
import ToggleSwitch from './ToggleSwitch';

interface VisibilitySettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleHideChange: (newValue: boolean) => void;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
	handlePowerFollowMeChange: (newValue: boolean) => void;
	handleIsDocumentChange: (newValue: boolean) => void;
}

const VisibilitySettings: FC<VisibilitySettingsProps> = ({
	statement,
	settings,
	handleHideChange,
	handleSettingChange,
	handlePowerFollowMeChange,
	handleIsDocumentChange,
}) => {
	const { t } = useTranslation();

	return (
		<>
			<ToggleSwitch
				isChecked={statement.hide ?? false}
				onChange={handleHideChange}
				label={t('Hide this statement')}
				description={t('Make this statement invisible to non-members')}
				icon={EyeOff}
			/>
			<ToggleSwitch
				isChecked={settings.hasChat ?? false}
				onChange={(checked) => handleSettingChange('hasChat', checked)}
				label={t('Enable Chat')}
				description={t('Allow members to chat and discuss')}
				icon={MessageCircle}
				badge="recommended"
			/>
			{settings.hasChat !== false && (
				<ToggleSwitch
					isChecked={settings.enableChatPanel ?? true}
					onChange={(checked) => handleSettingChange('enableChatPanel', checked)}
					label={t('Show Chat Side Panel')}
					description={t('Display the collapsible chat panel alongside the main content')}
					icon={MessageCircle}
				/>
			)}
			<ToggleSwitch
				isChecked={settings.hasChildren ?? false}
				onChange={(checked) => handleSettingChange('hasChildren', checked)}
				label={t('Enable Sub-Conversations')}
				description={t('Allow nested discussions and sub-topics')}
				icon={GitBranch}
			/>
			<ToggleSwitch
				isChecked={settings.enableSubQuestionsMap ?? true}
				onChange={(checked) => handleSettingChange('enableSubQuestionsMap', checked)}
				label={t('Show Sub-Questions Map')}
				description={t('Display the navigational tree of sub-questions alongside the main content')}
				icon={GitBranch}
			/>
			<ToggleSwitch
				isChecked={!!statement.powerFollowMe}
				onChange={handlePowerFollowMeChange}
				label={t('Power Follow Me')}
				description={t('Auto-redirect all participants to the instructor screen')}
				icon={Radio}
			/>
			<ToggleSwitch
				isChecked={statement.isDocument ?? false}
				onChange={handleIsDocumentChange}
				label={t('Mark as a Document')}
				description={t('Make this statement available as a signable document in Freedi Sign')}
				icon={FileText}
			/>
			{statement.isDocument && (
				<a
					href={getSignDocumentUrl(statement.statementId)}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.signAppLink}
				>
					<ExternalLink size={16} />
					{t('Open in Freedi Sign')}
				</a>
			)}
		</>
	);
};

export default VisibilitySettings;
