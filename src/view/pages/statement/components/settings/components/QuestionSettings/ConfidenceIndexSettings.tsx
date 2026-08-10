import { FC, useState, useCallback } from 'react';
import {
	Statement,
	DEFAULT_SAMPLING_QUALITY,
	resolveStakeholderCount,
	type StakeholderSource,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import {
	setConfidenceIndexSettings,
	requestRecalculateIndices,
} from '@/controllers/db/evaluation/setEvaluation';
import { logError } from '@/utils/errorHandling';
import styles from './QuestionSettings.module.scss';

interface ConfidenceIndexSettingsProps {
	statement: Statement;
}

const SAMPLING_QUALITY_PRESETS = [
	{ label: 'Stratified random sample', value: 1.0 },
	{ label: 'Simple random sample', value: 0.9 },
	{ label: 'Invited panel', value: 0.7 },
	{ label: 'Open with balancing', value: 0.4 },
	{ label: 'Fully self-selected', value: DEFAULT_SAMPLING_QUALITY },
] as const;

/** Where an inherited count came from, phrased for the person reading it */
const SOURCE_LABEL: Record<StakeholderSource, string> = {
	self: 'Set here',
	parent: 'Inherited from the parent question',
	top: 'Inherited from the group',
	topMembers: "Using the group's member count",
	parentMembers: "Using the parent question's member count",
};

const ConfidenceIndexSettings: FC<ConfidenceIndexSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	// A deliberation declares its stakeholders once, on the group, and every
	// question beneath inherits it. Showing what WOULD apply is the difference
	// between an empty field that means "unset" and one that means "unset here,
	// and here is what you get instead".
	const parentStatement = useAppSelector(statementSelector(statement.parentId));
	const topStatement = useAppSelector(statementSelector(statement.topParentId));

	const declaredHere = statement.evaluationSettings?.targetPopulation;
	const inherited = resolveStakeholderCount(undefined, parentStatement, topStatement);
	const effective = resolveStakeholderCount(statement, parentStatement, topStatement);

	const currentQ = statement.evaluationSettings?.samplingQuality ?? DEFAULT_SAMPLING_QUALITY;

	const [targetPopulation, setTargetPopulation] = useState<string>(
		declaredHere ? String(declaredHere) : '',
	);
	const [samplingQuality, setSamplingQuality] = useState<number>(currentQ);
	const [isRecalculating, setIsRecalculating] = useState(false);
	const [recalcResult, setRecalcResult] = useState<string>('');

	const handleTargetPopulationBlur = useCallback(() => {
		try {
			const value = parseInt(targetPopulation, 10);
			setConfidenceIndexSettings(statement.statementId, {
				targetPopulation: isNaN(value) || value <= 0 ? 0 : value,
			});
		} catch (error) {
			logError(error, { operation: 'ConfidenceIndexSettings.handleTargetPopulationBlur' });
		}
	}, [targetPopulation, statement.statementId]);

	const handleSamplingQualityChange = useCallback(
		(value: number) => {
			try {
				setSamplingQuality(value);
				setConfidenceIndexSettings(statement.statementId, {
					samplingQuality: value,
				});
			} catch (error) {
				logError(error, { operation: 'ConfidenceIndexSettings.handleSamplingQualityChange' });
			}
		},
		[statement.statementId],
	);

	const handleRecalculate = useCallback(async () => {
		try {
			setIsRecalculating(true);
			setRecalcResult('');
			const result = await requestRecalculateIndices(statement.statementId);
			setRecalcResult(`${t('Recalculated indices for')} ${result.optionsUpdated} ${t('options')}`);
		} catch (error) {
			logError(error, { operation: 'ConfidenceIndexSettings.handleRecalculate' });
			setRecalcResult(t('Recalculation failed'));
		} finally {
			setIsRecalculating(false);
		}
	}, [statement.statementId, t]);

	return (
		<>
			<p className={styles.confidenceIndex__description}>
				{t(
					'How many people have a stake in this decision — including those the process never reached. Once all of them have evaluated, the score stops hedging and reports what they actually think.',
				)}
			</p>

			<div className={styles.confidenceIndex}>
				<div className={styles.confidenceIndex__field}>
					<label>{t('Number of stakeholders')}</label>
					<input
						type="number"
						min="1"
						placeholder={
							inherited.count !== undefined
								? `${inherited.count} (${t(SOURCE_LABEL[inherited.source as StakeholderSource])})`
								: t('How many people have standing in this decision?')
						}
						value={targetPopulation}
						onChange={(e) => setTargetPopulation(e.target.value)}
						onBlur={handleTargetPopulationBlur}
						data-cy="target-population-input"
					/>
					<span className={styles.confidenceIndex__inheritedNote} data-cy="stakeholder-source-note">
						{effective.count === undefined
							? t('Not set anywhere — scores stay uncorrected for an unbounded population')
							: `${t(SOURCE_LABEL[effective.source as StakeholderSource])}: ${effective.count}`}
					</span>
					{effective.inferred && (
						<span className={styles.confidenceIndex__inheritedNote}>
							{t(
								'Inferred from who subscribed, which may not be who has standing. Set a number to be explicit.',
							)}
						</span>
					)}
				</div>

				<div className={styles.confidenceIndex__field}>
					<label>{t('Sampling Quality')}</label>
					<select
						value={samplingQuality}
						onChange={(e) => handleSamplingQualityChange(parseFloat(e.target.value))}
						data-cy="sampling-quality-select"
					>
						{SAMPLING_QUALITY_PRESETS.map((preset) => (
							<option key={preset.value} value={preset.value}>
								{t(preset.label)} ({preset.value})
							</option>
						))}
					</select>
				</div>

				<div className={styles.confidenceIndex__field}>
					<button
						type="button"
						className={styles.confidenceIndex__recalcButton}
						onClick={handleRecalculate}
						disabled={isRecalculating}
						data-cy="recalculate-indices-button"
					>
						{isRecalculating
							? t('Recalculating...')
							: t('Recalculate indices for existing evaluations')}
					</button>
					{recalcResult && (
						<span className={styles.confidenceIndex__resultMessage}>{recalcResult}</span>
					)}
				</div>
			</div>
		</>
	);
};

export default ConfidenceIndexSettings;
