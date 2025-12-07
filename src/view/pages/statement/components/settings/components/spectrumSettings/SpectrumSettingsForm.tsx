import { FC, useState, useEffect } from 'react';
import { Statement, User } from 'delib-npm';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { SpectrumSettings, DEFAULT_SPECTRUM_LABELS, DEFAULT_SPECTRUM_QUESTION } from '@/types/spectrumSettings';
import {
	getSpectrumSettings,
	saveSpectrumSettings,
	getDefaultSpectrumSettings,
} from '@/controllers/db/spectrumSettings';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import SectionTitle from '../sectionTitle/SectionTitle';
import styles from './SpectrumSettingsForm.module.scss';

interface SpectrumSettingsFormProps {
	statement: Statement;
	user: User;
}

const SpectrumSettingsForm: FC<SpectrumSettingsFormProps> = ({ statement, user }) => {
	const { t } = useTranslation();

	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [enabled, setEnabled] = useState(false);
	const [questionText, setQuestionText] = useState(DEFAULT_SPECTRUM_QUESTION);
	const [labels, setLabels] = useState<[string, string, string, string, string]>([...DEFAULT_SPECTRUM_LABELS]);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);

	// Load existing settings
	useEffect(() => {
		const loadSettings = async () => {
			setIsLoading(true);
			const settings = await getSpectrumSettings(statement.statementId);

			if (settings) {
				setEnabled(settings.enabled);
				setQuestionText(settings.questionText);
				setLabels(settings.labels);
			}
			setIsLoading(false);
		};

		loadSettings();
	}, [statement.statementId]);

	const handleLabelChange = (index: number, value: string) => {
		const newLabels = [...labels] as [string, string, string, string, string];
		newLabels[index] = value;
		setLabels(newLabels);
	};

	const handleSave = async () => {
		setIsSaving(true);
		setSaveMessage(null);

		const settings = {
			statementId: statement.statementId,
			questionText,
			labels,
			enabled,
			createdBy: {
				uid: user.uid,
				displayName: user.displayName || 'Admin',
			},
		};

		const result = await saveSpectrumSettings(settings);

		if (result) {
			// Also enable/disable the join button based on spectrum settings
			setStatementSettingToDB({
				statement,
				property: 'joiningEnabled',
				newValue: enabled,
				settingsSection: 'statementSettings',
			});
			setSaveMessage(t('Settings saved successfully'));
		} else {
			setSaveMessage(t('Failed to save settings'));
		}

		setIsSaving(false);

		// Clear message after 3 seconds
		setTimeout(() => setSaveMessage(null), 3000);
	};

	const handleReset = () => {
		setQuestionText(DEFAULT_SPECTRUM_QUESTION);
		setLabels([...DEFAULT_SPECTRUM_LABELS]);
	};

	if (isLoading) {
		return (
			<div className={styles.spectrumSettings}>
				<SectionTitle title={t('Spectrum Survey Settings')} />
				<div className={styles.spectrumSettings__loading}>
					{t('Loading...')}
				</div>
			</div>
		);
	}

	return (
		<div className={styles.spectrumSettings}>
			<SectionTitle title={t('Spectrum Survey Settings')} />

			<div className={styles.spectrumSettings__content}>
				<p className={styles.spectrumSettings__description}>
					{t('Configure the spectrum survey for heterogeneous room assignment. When enabled, users can join options and will be asked about their position on the topic.')}
				</p>

				{/* Enable Toggle */}
				<div className={styles.spectrumSettings__field}>
					<label className={styles.spectrumSettings__toggleLabel}>
						<input
							type="checkbox"
							checked={enabled}
							onChange={(e) => setEnabled(e.target.checked)}
							className={styles.spectrumSettings__checkbox}
						/>
						<span>{t('Enable heterogeneous room assignment')}</span>
					</label>
					<p className={styles.spectrumSettings__hint}>
						{t('This will enable the Join button on options and show a spectrum survey when users join')}
					</p>
				</div>

				{enabled && (
					<>
						{/* Question Text */}
						<div className={styles.spectrumSettings__field}>
							<label className={styles.spectrumSettings__label}>
								{t('Survey Question')}
							</label>
							<input
								type="text"
								value={questionText}
								onChange={(e) => setQuestionText(e.target.value)}
								placeholder={t('Where do you position yourself on this issue?')}
								className={styles.spectrumSettings__input}
							/>
						</div>

						{/* Labels */}
						<div className={styles.spectrumSettings__field}>
							<label className={styles.spectrumSettings__label}>
								{t('Spectrum Labels (1-5)')}
							</label>
							<p className={styles.spectrumSettings__hint}>
								{t('Define labels for each position on the 1-5 scale')}
							</p>
							<div className={styles.spectrumSettings__labels}>
								{labels.map((label, index) => (
									<div key={index} className={styles.spectrumSettings__labelItem}>
										<span className={styles.spectrumSettings__labelNumber}>
											{index + 1}
										</span>
										<input
											type="text"
											value={label}
											onChange={(e) => handleLabelChange(index, e.target.value)}
											placeholder={DEFAULT_SPECTRUM_LABELS[index]}
											className={styles.spectrumSettings__labelInput}
										/>
									</div>
								))}
							</div>
						</div>

						{/* Preview */}
						<div className={styles.spectrumSettings__preview}>
							<div className={styles.spectrumSettings__previewTitle}>
								{t('Preview')}
							</div>
							<div className={styles.spectrumSettings__previewContent}>
								<p className={styles.spectrumSettings__previewQuestion}>
									{questionText}
								</p>
								<div className={styles.spectrumSettings__previewScale}>
									{labels.map((label, index) => (
										<div
											key={index}
											className={styles.spectrumSettings__previewLabel}
										>
											<div className={styles.spectrumSettings__previewDot} />
											<span>{label}</span>
										</div>
									))}
								</div>
							</div>
						</div>
					</>
				)}

				{/* Actions */}
				<div className={styles.spectrumSettings__actions}>
					{enabled && (
						<Button
							text={t('Reset to Defaults')}
							buttonType={ButtonType.SECONDARY}
							onClick={handleReset}
						/>
					)}
					<Button
						text={isSaving ? t('Saving...') : t('Save Settings')}
						buttonType={ButtonType.PRIMARY}
						onClick={handleSave}
						disabled={isSaving}
					/>
				</div>

				{/* Save Message */}
				{saveMessage && (
					<div className={styles.spectrumSettings__message}>
						{saveMessage}
					</div>
				)}
			</div>
		</div>
	);
};

export default SpectrumSettingsForm;
