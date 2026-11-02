import { FC, useState } from 'react';
import { DEFAULT_SAMPLING_QUALITY, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	requestRecalculateIndices,
	setConfidenceIndexSettings,
} from '@/controllers/db/evaluation/setEvaluation';
import { logError } from '@/utils/errorHandling';
import InlineNote from '@/view/components/atomic/atoms/InlineNote';
import styles from './ConfidenceIndexSettings.module.scss';

const SAMPLING_QUALITY_PRESETS = [
	{ label: 'Stratified random sample', value: 1.0 },
	{ label: 'Simple random sample', value: 0.9 },
	{ label: 'Invited panel', value: 0.7 },
	{ label: 'Open with balancing', value: 0.4 },
	{ label: 'Fully self-selected', value: DEFAULT_SAMPLING_QUALITY },
] as const;

type RecalcResult = { kind: 'done'; optionsUpdated: number } | { kind: 'failed' } | null;

interface StakeholderMoreProps {
	statement: Statement;
}

/**
 * The expert half of Stakeholders, behind "More" (IA defect 18): sample
 * quality and recalculating existing scores. Writes
 * `evaluationSettings.samplingQuality` as before.
 */
const StakeholderMore: FC<StakeholderMoreProps> = ({ statement }) => {
	const { t } = useTranslation();
	const [samplingQuality, setSamplingQuality] = useState<number>(
		statement.evaluationSettings?.samplingQuality ?? DEFAULT_SAMPLING_QUALITY,
	);
	const [isRecalculating, setIsRecalculating] = useState(false);
	const [recalcResult, setRecalcResult] = useState<RecalcResult>(null);
	const [saveFailed, setSaveFailed] = useState(false);

	async function handleSamplingQualityChange(value: number): Promise<void> {
		setSamplingQuality(value);
		setSaveFailed(false);
		try {
			await setConfidenceIndexSettings(statement.statementId, { samplingQuality: value });
		} catch (error) {
			logError(error, {
				operation: 'ConfidenceIndexSettings.handleSamplingQualityChange',
				statementId: statement.statementId,
				metadata: { samplingQuality: value },
			});
			setSaveFailed(true);
		}
	}

	async function handleRecalculate(): Promise<void> {
		setIsRecalculating(true);
		setRecalcResult(null);
		try {
			const result = await requestRecalculateIndices(statement.statementId);
			setRecalcResult({ kind: 'done', optionsUpdated: result.optionsUpdated });
		} catch (error) {
			logError(error, {
				operation: 'ConfidenceIndexSettings.handleRecalculate',
				statementId: statement.statementId,
			});
			setRecalcResult({ kind: 'failed' });
		} finally {
			setIsRecalculating(false);
		}
	}

	return (
		<details className="disclosure">
			<summary className="disclosure__summary">{t('people.more')}</summary>
			<div className="disclosure__body">
				<div className={styles.field}>
					<label htmlFor={`${statement.statementId}-sampling-quality`}>
						{t('people.sampleQuality')}
					</label>
					<select
						id={`${statement.statementId}-sampling-quality`}
						value={samplingQuality}
						onChange={(e) => void handleSamplingQualityChange(parseFloat(e.target.value))}
						data-cy="sampling-quality-select"
					>
						{SAMPLING_QUALITY_PRESETS.map((preset) => (
							<option key={preset.value} value={preset.value}>
								{t(preset.label)} ({preset.value})
							</option>
						))}
					</select>
					{saveFailed && <InlineNote variant="error">{t('people.error.save')}</InlineNote>}
				</div>
				<div className={styles.recalc}>
					<button
						type="button"
						className="button button--secondary button--small button--touch"
						onClick={() => void handleRecalculate()}
						disabled={isRecalculating}
						data-cy="recalculate-indices-button"
					>
						{isRecalculating ? t('people.recalculating') : t('people.recalculate')}
					</button>
					{recalcResult?.kind === 'done' && (
						<InlineNote variant="info">
							{`${t('Recalculated indices for')} ${recalcResult.optionsUpdated} ${t('options')}`}
						</InlineNote>
					)}
					{recalcResult?.kind === 'failed' && (
						<InlineNote variant="error">{t('Recalculation failed')}</InlineNote>
					)}
				</div>
			</div>
		</details>
	);
};

export default StakeholderMore;
