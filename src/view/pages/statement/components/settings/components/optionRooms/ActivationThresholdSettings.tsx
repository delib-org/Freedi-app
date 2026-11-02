import { FC } from 'react';
import { ActivationThreshold, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { Toggle } from '@/view/components/atomic/atoms/Toggle';
import styles from './OptionRooms.module.scss';

interface ActivationThresholdSettingsProps {
	statement: Statement;
}

/**
 * Activation threshold (Joining answers & rooms): an answer counts as active
 * only once enough activists and organizers joined it. Writes
 * `statementSettings.activationThreshold`, as Participation rules did.
 */
const ActivationThresholdSettings: FC<ActivationThresholdSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const threshold = statement.statementSettings?.activationThreshold;

	function updateThreshold(updates: Partial<ActivationThreshold>): void {
		const current: ActivationThreshold = threshold ?? { enabled: false };
		setStatementSettingToDB({
			statement,
			property: 'activationThreshold',
			newValue: { ...current, ...updates } as Record<string, unknown>,
			settingsSection: 'statementSettings',
		});
	}

	const minimumField = (key: 'minActivists' | 'minOrganizers', label: string) => (
		<label className={styles.optionRooms__inlineNumber}>
			<span>{label}</span>
			<input
				type="number"
				min={0}
				inputMode="numeric"
				value={threshold?.[key] ?? 0}
				onChange={(e) => updateThreshold({ [key]: Number(e.target.value) })}
				className={styles.optionRooms__numberInput}
			/>
		</label>
	);

	return (
		<div className={styles.optionRooms__group}>
			<Toggle
				checked={threshold?.enabled ?? false}
				onChange={(enabled) => updateThreshold({ enabled })}
				label={t('people.activationThreshold')}
				hint={t('people.activationThreshold.hint')}
			/>
			{threshold?.enabled && (
				<div className={styles.optionRooms__inlineFields}>
					{minimumField('minActivists', t('people.minActivists'))}
					{minimumField('minOrganizers', t('people.minOrganizers'))}
				</div>
			)}
		</div>
	);
};

export default ActivationThresholdSettings;
