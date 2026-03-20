import { FC, useState, useCallback } from 'react';
import { Statement, DEFAULT_SAMPLING_QUALITY } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setConfidenceIndexSettings } from '@/controllers/db/evaluation/setEvaluation';
import SectionTitle from '../sectionTitle/SectionTitle';
import { logError } from '@/utils/errorHandling';

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
		currentN ? String(currentN) : ''
	);
	const [samplingQuality, setSamplingQuality] = useState<number>(currentQ);

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
		[statement.statementId]
	);

	return (
		<div>
			<SectionTitle title={t('Sample Representativeness')} />
			<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
				{t('Set target population to enable confidence index')}
			</p>

			<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
						{t('Target Population Size')}
					</label>
					<input
						type="number"
						min="1"
						placeholder={t('How many people are in the target community?')}
						value={targetPopulation}
						onChange={(e) => setTargetPopulation(e.target.value)}
						onBlur={handleTargetPopulationBlur}
						style={{
							width: '100%',
							maxWidth: '300px',
							padding: '0.5rem',
							border: '1px solid var(--border-color)',
							borderRadius: '4px',
							fontSize: '1rem',
							backgroundColor: 'var(--input-background)',
							color: 'var(--text-primary)',
						}}
					/>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					<label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
						{t('Sampling Quality')}
					</label>
					<select
						value={samplingQuality}
						onChange={(e) => handleSamplingQualityChange(parseFloat(e.target.value))}
						style={{
							width: '100%',
							maxWidth: '300px',
							padding: '0.5rem',
							border: '1px solid var(--border-color)',
							borderRadius: '4px',
							fontSize: '0.9rem',
							backgroundColor: 'var(--input-background)',
							color: 'var(--text-primary)',
						}}
					>
						{SAMPLING_QUALITY_PRESETS.map((preset) => (
							<option key={preset.value} value={preset.value}>
								{t(preset.label)} ({preset.value})
							</option>
						))}
					</select>
				</div>
			</div>
		</div>
	);
};

export default ConfidenceIndexSettings;
