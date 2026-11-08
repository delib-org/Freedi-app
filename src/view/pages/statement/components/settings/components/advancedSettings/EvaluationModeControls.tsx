import { FC } from 'react';
import { EvaluationUI, Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setParticipationMode } from '@/controllers/db/evaluation/setEvaluation';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import styles from './EnhancedAdvancedSettings.module.scss';

interface EvaluationModeControlsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (property: keyof StatementSettings, newValue: string) => void;
}

/**
 * How people evaluate the options: card stacks (default) or voting, and,
 * when voting, which options the ballot lists. Writes the same
 * evaluationSettings.evaluationUI field as the Instant Settings switch.
 */
const EvaluationModeControls: FC<EvaluationModeControlsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	if (statement.statementType !== StatementType.question) return null;

	const mode = statement.evaluationSettings?.evaluationUI ?? EvaluationUI.suggestions;
	const isVoting = mode === EvaluationUI.voting;
	const optionsSource = settings.votingOptionsSource ?? 'all';

	function handleModeChange(value: string) {
		setParticipationMode(statement, value as EvaluationUI);
	}

	return (
		<>
			<h4 className={styles.sectionTitle}>{t('Evaluation method')}</h4>
			<MultiSwitch
				options={[
					{
						label: t('Card stacks'),
						value: EvaluationUI.suggestions,
						toolTip: t('Everyone scores each suggestion, one card at a time'),
					},
					{
						label: t('Voting'),
						value: EvaluationUI.voting,
						toolTip: t('Each person picks a single option'),
					},
				]}
				onClick={handleModeChange}
				currentValue={mode}
			/>
			{isVoting && (
				<>
					<h4 className={styles.sectionTitle}>{t('Options shown in voting')}</h4>
					<MultiSwitch
						options={[
							{
								label: t('Show all options'),
								value: 'all',
							},
							{
								label: t('Only options selected in the card-stack evaluation'),
								value: 'positivelyEvaluated',
								toolTip: t('Options the group rated positively in the card-stack evaluation'),
							},
						]}
						onClick={(value) => handleSettingChange('votingOptionsSource', value)}
						currentValue={optionsSource}
					/>
				</>
			)}
		</>
	);
};

export default EvaluationModeControls;
