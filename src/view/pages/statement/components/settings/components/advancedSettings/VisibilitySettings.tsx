import { FC } from 'react';
import { Statement, StatementSettings } from '@freedi/shared-types';
import {
	EyeOff,
	MessageCircle,
	GitBranch,
	Radio,
	FileText,
	ExternalLink,
	Layout,
} from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getSignDocumentUrl } from '@/utils/urlHelpers';
import styles from './EnhancedAdvancedSettings.module.scss';
import ToggleSwitch from './ToggleSwitch';

const DEFAULT_VIEW_OPTIONS = [
	{ value: 'chat', labelKey: 'Chat' },
	{ value: 'options', labelKey: 'Options' },
	{ value: 'questions', labelKey: 'Questions' },
] as const;

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
	const currentDefaultView = settings.defaultView ?? 'chat';

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
			<div className={styles.toggleItem}>
				<div className={styles.toggleContent}>
					<div className={styles.toggleIcon}>
						<Layout size={18} />
					</div>
					<div className={styles.toggleInfo}>
						<div className={styles.toggleHeader}>
							<span className={styles.toggleLabel}>{t('Default View')}</span>
						</div>
						<p className={styles.toggleDescription}>
							{t('Choose which view participants see first')}
						</p>
						<div className={styles.defaultViewOptions}>
							{DEFAULT_VIEW_OPTIONS.map((option) => (
								<label key={option.value} className={styles.defaultViewOption}>
									<input
										type="radio"
										name="defaultView"
										value={option.value}
										checked={currentDefaultView === option.value}
										onChange={() => handleSettingChange('defaultView', option.value)}
									/>
									<span>{t(option.labelKey)}</span>
								</label>
							))}
						</div>
					</div>
				</div>
			</div>
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
