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
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { setStatement } from '@/redux/statements/statementsSlice';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import SectionTitle from '../sectionTitle/SectionTitle';
import styles from './SpectrumSettingsForm.module.scss';

interface SpectrumSettingsFormProps {
	statement: Statement;
	user: User;
}

const SpectrumSettingsForm: FC<SpectrumSettingsFormProps> = ({ statement, user }) => {
	const { t } = useTranslation();
	const dispatch = useAppDispatch();

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

	// Auto-save when toggle changes - use current values or defaults
	const handleToggleChange = async (newEnabled: boolean) => {
		setEnabled(newEnabled);
		setIsSaving(true);

		const settings = {
			statementId: statement.statementId,
			questionText: questionText || DEFAULT_SPECTRUM_QUESTION,
			labels: labels.every(l => l) ? labels : [...DEFAULT_SPECTRUM_LABELS] as [string, string, string, string, string],
			enabled: newEnabled,
			createdBy: {
				uid: user.uid,
				displayName: user.displayName || 'Admin',
			},
		};

		console.info('SpectrumSettings: Auto-saving on toggle:', settings);
		const result = await saveSpectrumSettings(settings);

		if (result) {
			// Update Redux
			const updatedStatement: Statement = {
				...statement,
				statementSettings: {
					...(statement.statementSettings || {}),
					joiningEnabled: newEnabled,
				},
			};
			dispatch(setStatement(updatedStatement));
			setSaveMessage(newEnabled ? t('Enabled with default settings') : t('Disabled'));
		} else {
			setSaveMessage(t('Failed to save'));
			setEnabled(!newEnabled); // Revert on failure
		}

		setIsSaving(false);
		setTimeout(() => setSaveMessage(null), 2000);
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

		console.info('SpectrumSettings: Saving settings:', settings);
		const result = await saveSpectrumSettings(settings);
		console.info('SpectrumSettings: Save result:', result);

		if (result) {
			// Also enable/disable the join button based on spectrum settings
			// Await the Firestore write to ensure data is persisted before updating Redux
			const joiningUpdateSuccess = await setStatementSettingToDB({
				statement,
				property: 'joiningEnabled',
				newValue: enabled,
				settingsSection: 'statementSettings',
			});

			if (joiningUpdateSuccess) {
				// Update Redux store with the new joiningEnabled setting
				const updatedStatement: Statement = {
					...statement,
					statementSettings: {
						...(statement.statementSettings || {}),
						joiningEnabled: enabled,
					},
				};

				console.info('SpectrumSettings: Dispatching updated statement with joiningEnabled:', enabled, 'statementId:', statement.statementId);
				dispatch(setStatement(updatedStatement));
			}

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
							onChange={(e) => handleToggleChange(e.target.checked)}
							disabled={isSaving}
							className={styles.spectrumSettings__checkbox}
						/>
						<span>{t('Enable heterogeneous room assignment')}</span>
						{isSaving && <span className={styles.spectrumSettings__savingIndicator}>{t('Saving...')}</span>}
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
