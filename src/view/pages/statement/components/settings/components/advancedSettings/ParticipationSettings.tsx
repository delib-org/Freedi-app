import { FC } from 'react';
import { Statement, StatementSettings, StatementType, ActivationThreshold } from '@freedi/shared-types';
import { UserPlus, Plus, Target } from 'lucide-react';
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
}

const ParticipationSettings: FC<ParticipationSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	const threshold = settings.activationThreshold;

	function updateThreshold(updates: Partial<ActivationThreshold>) {
		const current: ActivationThreshold = threshold ?? { enabled: false };
		const updated = { ...current, ...updates };
		setStatementSettingToDB({
			statement,
			property: 'activationThreshold',
			newValue: updated as Record<string, unknown>,
			settingsSection: 'statementSettings',
		});
	}

	return (
		<>
			{statement.statementType === StatementType.question && (
				<>
					<ToggleSwitch
						isChecked={settings.joiningEnabled ?? false}
						onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
						label={t('Enable Joining Options')}
						description={t('Allow users to join and support specific options')}
						icon={UserPlus}
					/>
					{settings.joiningEnabled && (
						<>
							<ToggleSwitch
								isChecked={threshold?.enabled ?? false}
								onChange={(checked) => updateThreshold({ enabled: checked })}
								label={t('Activation Threshold')}
								description={t('Require minimum activists/organizers to activate an option')}
								icon={Target}
							/>
							{threshold?.enabled && (
								<div style={{ display: 'flex', gap: '16px', padding: '0 16px 12px', marginTop: '-4px' }}>
									<label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
										<span>{t('Min. activists')}</span>
										<input
											type="number"
											min={0}
											value={threshold.minActivists ?? 0}
											onChange={(e) => updateThreshold({ minActivists: Number(e.target.value) })}
											style={{ width: '60px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #ccc' }}
										/>
									</label>
									<label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
										<span>{t('Min. organizers')}</span>
										<input
											type="number"
											min={0}
											value={threshold.minOrganizers ?? 0}
											onChange={(e) => updateThreshold({ minOrganizers: Number(e.target.value) })}
											style={{ width: '60px', padding: '4px 8px', borderRadius: '8px', border: '1px solid #ccc' }}
										/>
									</label>
								</div>
							)}
						</>
					)}
				</>
			)}
			<ToggleSwitch
				isChecked={settings.enableAddVotingOption ?? false}
				onChange={(checked) => handleSettingChange('enableAddVotingOption', checked)}
				label={t('Add Options in Voting')}
				description={t('Participants can contribute new options while voting')}
				icon={Plus}
				badge="recommended"
			/>
			<ToggleSwitch
				isChecked={settings.enableAddEvaluationOption ?? false}
				onChange={(checked) => handleSettingChange('enableAddEvaluationOption', checked)}
				label={t('Add Options in Evaluation')}
				description={t('Participants can add options during evaluation')}
				icon={Plus}
			/>
		</>
	);
};

export default ParticipationSettings;
