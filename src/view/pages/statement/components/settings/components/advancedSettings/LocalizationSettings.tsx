import { FC, useEffect, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { Globe, Lock } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EnhancedAdvancedSettings.module.scss';
import LanguageSelector from './LanguageSelector/LanguageSelector';
import ToggleSwitch from './ToggleSwitch';

interface LocalizationSettingsProps {
	statement: Statement;
	handleDefaultLanguageChange: (newLanguage: string) => void;
	handleForceLanguageChange: (newValue: boolean) => void;
}

const LocalizationSettings: FC<LocalizationSettingsProps> = ({
	statement,
	handleDefaultLanguageChange,
	handleForceLanguageChange,
}) => {
	const { t } = useTranslation();
	// Optimistic local state so the toggle snaps instantly on click. The Redux
	// store catches up when the Firestore listener fires; that sync re-applies
	// the authoritative value via the useEffect below.
	const [force, setForce] = useState<boolean>(statement.forceLanguage ?? false);
	useEffect(() => {
		setForce(statement.forceLanguage ?? false);
	}, [statement.forceLanguage]);

	const onForceToggle = (next: boolean) => {
		setForce(next);
		handleForceLanguageChange(next);
	};

	return (
		<>
			<div className={styles.languageSection}>
				<h4 className={styles.sectionTitle}>
					<Globe size={18} />
					{t('Survey Default Language')}
				</h4>
				<p className={styles.sectionDescription}>
					{t('This language will be used for surveys when users have no language preference set')}
				</p>
				<LanguageSelector
					currentLanguage={statement.defaultLanguage}
					onChange={handleDefaultLanguageChange}
				/>
			</div>
			<ToggleSwitch
				isChecked={force}
				onChange={onForceToggle}
				label={t('Force survey language (override browser preferences)')}
				description={t(
					'When enabled, all participants will see the survey in the default language regardless of their browser settings',
				)}
				icon={Lock}
			/>
		</>
	);
};

export default LocalizationSettings;
