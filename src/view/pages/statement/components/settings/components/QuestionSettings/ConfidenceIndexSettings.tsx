import { FC, useState, useCallback } from 'react';
import { Statement, DEFAULT_SAMPLING_QUALITY } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
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

const ConfidenceIndexSettings: FC<ConfidenceIndexSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const currentN = statement.evaluationSettings?.targetPopulation;
	const currentQ = statement.evaluationSettings?.samplingQuality ?? DEFAULT_SAMPLING_QUALITY;

	const [targetPopulation, setTargetPopulation] = useState<string>(
		currentN ? String(currentN) : '',
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
				{t('Set target population to enable confidence index')}
			</p>

			<div className={styles.confidenceIndex}>
				<div className={styles.confidenceIndex__field}>
					<label>{t('Target Population Size')}</label>
					<input
						type="number"
						min="1"
						placeholder={t('How many people are in the target community?')}
						value={targetPopulation}
						onChange={(e) => setTargetPopulation(e.target.value)}
						onBlur={handleTargetPopulationBlur}
						data-cy="target-population-input"
					/>
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
