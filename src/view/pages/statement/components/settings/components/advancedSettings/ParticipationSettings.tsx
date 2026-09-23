import { FC } from 'react';
import {
	Statement,
	StatementSettings,
	StatementType,
	ActivationThreshold,
} from '@freedi/shared-types';
import { UserPlus, Target, Lightbulb, MessageCircle } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import ToggleSwitch from './ToggleSwitch';
import JoinFormCard from './JoinFormCard';
import SubQuestionJoinFormsCard from './SubQuestionJoinFormsCard/SubQuestionJoinFormsCard';

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
			{statement.statementType === StatementType.question && (
				<>
					<ToggleSwitch
						isChecked={statement.questionSettings?.askUserForASolutionBeforeEvaluation ?? false}
						onChange={handleRequireSolutionToggle}
						label={t('Ask for their own idea first')}
						description={t('Participants must suggest before they can rate others')}
						icon={Lightbulb}
					/>
					<ToggleSwitch
						isChecked={settings.joiningEnabled ?? false}
						onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
						label={t('Enable Joining Options')}
						description={t('Allow users to join and support specific options')}
						icon={UserPlus}
					/>
					{settings.joiningEnabled && (
						<>
							<JoinFormCard statement={statement} />
							<SubQuestionJoinFormsCard statement={statement} />
							<ToggleSwitch
								isChecked={threshold?.enabled ?? false}
								onChange={(checked) => updateThreshold({ enabled: checked })}
								label={t('Activation Threshold')}
								description={t('Require minimum activists/organizers to activate an option')}
								icon={Target}
							/>
							{threshold?.enabled && (
								<div
									style={{
										display: 'flex',
										gap: '16px',
										padding: '0 16px 12px',
										marginTop: '-4px',
									}}
								>
									<label
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: '8px',
											fontSize: '0.875rem',
										}}
									>
										<span>{t('Min. activists')}</span>
										<input
											type="number"
											min={0}
											value={threshold.minActivists ?? 0}
											onChange={(e) => updateThreshold({ minActivists: Number(e.target.value) })}
											style={{
												width: '60px',
												padding: '4px 8px',
												borderRadius: '8px',
												border: '1px solid #ccc',
											}}
										/>
									</label>
									<label
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: '8px',
											fontSize: '0.875rem',
										}}
									>
										<span>{t('Min. organizers')}</span>
										<input
											type="number"
											min={0}
											value={threshold.minOrganizers ?? 0}
											onChange={(e) => updateThreshold({ minOrganizers: Number(e.target.value) })}
											style={{
												width: '60px',
												padding: '4px 8px',
												borderRadius: '8px',
												border: '1px solid #ccc',
											}}
										/>
									</label>
								</div>
							)}
						</>
					)}
				</>
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
