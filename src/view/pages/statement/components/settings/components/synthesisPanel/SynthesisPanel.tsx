import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { Statement } from '@freedi/shared-types';
import { saveSynthesisSettings } from '@/controllers/db/synthesis/saveSynthesisSettings';
import { listenSynthesisProgress } from '@/controllers/db/synthesis/listenSynthesisProgress';
import {
	synthesisCancel,
	synthesisPause,
	synthesisResume,
	triggerRejudgeGrayBand,
	triggerSynthesizeNow,
} from '@/controllers/db/synthesis/synthesisOperations';
import {
	DEFAULT_SYNTHESIS_SETTINGS,
	type SynthesisProgress,
	type SynthesisSettings,
} from '@/controllers/db/synthesis/types';
import Button from '@/view/components/atomic/atoms/Button/Button';
import Toggle from '@/view/components/atomic/atoms/Toggle/Toggle';
import SynthesisProgressBar from './SynthesisProgressBar';
import SelectiveOptionsList from './SelectiveOptionsList';
import styles from './SynthesisPanel.module.scss';

interface Props {
	statement: Statement;
}

/**
 * The admin mental-model: "I want to gate synthesis by EITHER engagement
 * (number of evaluators) OR quality (consensus score)". The backend still
 * AND-s minEvaluators and minConsensus, so we always set the unused metric
 * to its no-op floor (1 evaluators, 0 consensus) — this preserves the
 * backend contract while letting the UI expose a single threshold.
 */
type EligibilityMetric = 'evaluators' | 'consensus';

interface FieldErrors {
	threshold?: string;
	attachThreshold?: string;
	reviewLowerBound?: string;
}

interface ToastState {
	tone: 'info' | 'success' | 'error';
	message: string;
}

function readInitialSettings(statement: Statement): SynthesisSettings {
	const raw = (statement.statementSettings as Record<string, unknown> | undefined)?.[
		'synthesis'
	] as Partial<SynthesisSettings> | undefined;
	if (!raw) return { ...DEFAULT_SYNTHESIS_SETTINGS };

	return {
		enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_SYNTHESIS_SETTINGS.enabled,
		minEvaluators:
			typeof raw.minEvaluators === 'number'
				? raw.minEvaluators
				: DEFAULT_SYNTHESIS_SETTINGS.minEvaluators,
		minConsensus:
			typeof raw.minConsensus === 'number'
				? raw.minConsensus
				: DEFAULT_SYNTHESIS_SETTINGS.minConsensus,
		attachThreshold:
			typeof raw.attachThreshold === 'number'
				? raw.attachThreshold
				: DEFAULT_SYNTHESIS_SETTINGS.attachThreshold,
		reviewLowerBound:
			typeof raw.reviewLowerBound === 'number'
				? raw.reviewLowerBound
				: DEFAULT_SYNTHESIS_SETTINGS.reviewLowerBound,
	};
}

/**
 * Pick the dominant metric from stored settings. If consensus is gating
 * (>0) we show the consensus knob; otherwise we show the evaluator knob.
 */
function inferMetric(settings: SynthesisSettings): EligibilityMetric {
	return settings.minConsensus > 0 ? 'consensus' : 'evaluators';
}

function validateSettings(settings: SynthesisSettings, metric: EligibilityMetric): FieldErrors {
	const errors: FieldErrors = {};

	if (metric === 'evaluators') {
		if (!Number.isFinite(settings.minEvaluators) || settings.minEvaluators < 1) {
			errors.threshold = 'min 1';
		}
	} else if (
		!Number.isFinite(settings.minConsensus) ||
		settings.minConsensus < 0 ||
		settings.minConsensus > 1
	) {
		errors.threshold = 'range 0–1';
	}

	if (
		!Number.isFinite(settings.attachThreshold) ||
		settings.attachThreshold <= 0 ||
		settings.attachThreshold > 1
	) {
		errors.attachThreshold = 'range (0, 1]';
	}
	if (
		!Number.isFinite(settings.reviewLowerBound) ||
		settings.reviewLowerBound < 0.5 ||
		settings.reviewLowerBound >= 1
	) {
		errors.reviewLowerBound = 'range [0.5, 1)';
	}
	if (
		!errors.attachThreshold &&
		!errors.reviewLowerBound &&
		settings.reviewLowerBound >= settings.attachThreshold
	) {
		errors.reviewLowerBound = '< auto-attach threshold';
	}

	return errors;
}

const SynthesisPanel: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const initial = useMemo(() => readInitialSettings(statement), [statement]);
	const [settings, setSettings] = useState<SynthesisSettings>(initial);
	const [metric, setMetric] = useState<EligibilityMetric>(() => inferMetric(initial));
	const [progress, setProgress] = useState<SynthesisProgress | null>(null);
	const [saving, setSaving] = useState(false);
	const [busyOp, setBusyOp] = useState<string | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [dirty, setDirty] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	useEffect(() => {
		const unsub = listenSynthesisProgress(statement.statementId, setProgress);

		return () => unsub();
	}, [statement.statementId]);

	useEffect(() => {
		if (!toast) return;
		const id = setTimeout(() => setToast(null), 5000);

		return () => clearTimeout(id);
	}, [toast]);

	const errors = validateSettings(settings, metric);
	const hasErrors = Object.values(errors).some(Boolean);
	const isRunning = progress?.status === 'running' || progress?.status === 'paused';
	const panelDisabled = !settings.enabled;

	function updateField<K extends keyof SynthesisSettings>(
		key: K,
		value: SynthesisSettings[K],
	): void {
		setSettings((prev) => ({ ...prev, [key]: value }));
		setDirty(true);
	}

	function handleMetricChange(next: EligibilityMetric): void {
		setMetric(next);
		// When switching metrics, zero the *other* knob so the backend AND
		// gate doesn't double-filter. Keep the active metric's existing
		// value if reasonable, otherwise reseed sensible defaults.
		if (next === 'evaluators') {
			setSettings((prev) => ({
				...prev,
				minConsensus: 0,
				minEvaluators:
					prev.minEvaluators >= 1 ? prev.minEvaluators : DEFAULT_SYNTHESIS_SETTINGS.minEvaluators,
			}));
		} else {
			setSettings((prev) => ({
				...prev,
				minEvaluators: 1,
				minConsensus: prev.minConsensus > 0 ? prev.minConsensus : 0.5,
			}));
		}
		setDirty(true);
	}

	function handleThresholdChange(value: number): void {
		if (metric === 'evaluators') {
			updateField('minEvaluators', value);
		} else {
			updateField('minConsensus', value);
		}
	}

	async function handleSave(): Promise<void> {
		if (hasErrors) {
			setToast({ tone: 'error', message: t('Please fix validation errors before saving') });

			return;
		}
		setSaving(true);
		try {
			await saveSynthesisSettings(statement.statementId, settings);
			setDirty(false);
			setToast({ tone: 'success', message: t('Synthesis settings saved') });
		} catch (error) {
			setToast({
				tone: 'error',
				message: error instanceof Error ? error.message : t('Save failed'),
			});
		} finally {
			setSaving(false);
		}
	}

	async function withBusy<T>(opLabel: string, fn: () => Promise<T>): Promise<T | undefined> {
		setBusyOp(opLabel);
		try {
			return await fn();
		} catch (error) {
			setToast({
				tone: 'error',
				message: error instanceof Error ? error.message : t('Operation failed'),
			});

			return undefined;
		} finally {
			setBusyOp(null);
		}
	}

	async function handleSynthesizeNow(): Promise<void> {
		if (!settings.enabled) {
			setToast({ tone: 'info', message: t('Enable synthesis first') });

			return;
		}
		const confirmed = window.confirm(
			t('Synthesize all eligible options? This runs in the background.'),
		);
		if (!confirmed) return;
		const result = await withBusy('synthesizeNow', () =>
			triggerSynthesizeNow(statement.statementId),
		);
		if (result) {
			setToast({
				tone: 'info',
				message: `${t('Queued')} ${result.enqueued} ${t('options')} · ${t('ETA')} ${result.etaMinutes} ${t('min')}`,
			});
		}
	}

	async function handleRejudge(): Promise<void> {
		if (!settings.enabled) {
			setToast({ tone: 'info', message: t('Enable synthesis first') });

			return;
		}
		const result = await withBusy('rejudge', () => triggerRejudgeGrayBand(statement.statementId));
		if (result) {
			setToast({
				tone: 'info',
				message: `${t('Queued')} ${result.pairsEnqueued} ${t('medoid pairs for re-judgment')}`,
			});
		}
	}

	async function handlePause(): Promise<void> {
		await withBusy('pause', () => synthesisPause(statement.statementId));
	}
	async function handleResume(): Promise<void> {
		await withBusy('resume', () => synthesisResume(statement.statementId));
	}
	async function handleCancel(): Promise<void> {
		const confirmed = window.confirm(
			t(
				'Cancel synthesis? Pending items will be discarded. Already-processed items keep their cluster assignments.',
			),
		);
		if (!confirmed) return;
		await withBusy('cancel', () => synthesisCancel(statement.statementId));
	}

	const thresholdValue = metric === 'evaluators' ? settings.minEvaluators : settings.minConsensus;
	const thresholdLabel =
		metric === 'evaluators'
			? t('Minimum evaluators per option')
			: t('Minimum consensus score (0–1)');
	const thresholdHint =
		metric === 'evaluators'
			? t('Options will only be synthesized after this many people evaluate them.')
			: t('Options will only be synthesized once their consensus score reaches this value.');
	const thresholdStep = metric === 'evaluators' ? 1 : 0.05;
	const thresholdMin = metric === 'evaluators' ? 1 : 0;
	const thresholdMax = metric === 'evaluators' ? undefined : 1;

	return (
		<section className={styles.synthesisPanel} aria-labelledby="synthesis-panel-heading">
			{/* Header */}
			<header className={styles.panel__header}>
				<div>
					<h2 id="synthesis-panel-heading" className={styles.panel__title}>
						{t('Synthesis')}
					</h2>
					<p className={styles.panel__description}>
						{t(
							'Automatically cluster equivalent participant ideas into a single proposal so duplicates do not dilute the signal.',
						)}
					</p>
				</div>
				<div className={styles.panel__enable}>
					<Toggle
						id="synthesis-enabled"
						checked={settings.enabled}
						onChange={(checked) => updateField('enabled', checked)}
						label={settings.enabled ? t('On') : t('Off')}
						ariaLabel={t('Enable synthesis on this question')}
					/>
				</div>
			</header>

			<div
				className={styles.panel__body}
				data-disabled={panelDisabled ? 'true' : 'false'}
				aria-disabled={panelDisabled}
			>
				{/* Eligibility — the redesigned core */}
				<section className={styles.card} aria-labelledby="synthesis-eligibility-heading">
					<div className={styles.card__head}>
						<h3 id="synthesis-eligibility-heading" className={styles.card__title}>
							{t('When should an option be eligible?')}
						</h3>
						<p className={styles.card__subtitle}>
							{t('Pick the metric that gates synthesis, then set its threshold.')}
						</p>
					</div>

					<div
						role="radiogroup"
						aria-label={t('Eligibility metric')}
						className={styles.metricPicker}
					>
						<label className={styles.metricPicker__option} data-active={metric === 'evaluators'}>
							<input
								type="radio"
								name="eligibility-metric"
								value="evaluators"
								checked={metric === 'evaluators'}
								onChange={() => handleMetricChange('evaluators')}
								disabled={panelDisabled}
							/>
							<span className={styles.metricPicker__title}>{t('Number of evaluators')}</span>
							<span className={styles.metricPicker__hint}>
								{t('Gate by how many people have evaluated the option.')}
							</span>
						</label>
						<label className={styles.metricPicker__option} data-active={metric === 'consensus'}>
							<input
								type="radio"
								name="eligibility-metric"
								value="consensus"
								checked={metric === 'consensus'}
								onChange={() => handleMetricChange('consensus')}
								disabled={panelDisabled}
							/>
							<span className={styles.metricPicker__title}>{t('Consensus score')}</span>
							<span className={styles.metricPicker__hint}>
								{t('Gate by how much agreement the option has reached.')}
							</span>
						</label>
					</div>

					<div className={styles.threshold}>
						<label htmlFor="synthesis-threshold" className={styles.threshold__label}>
							{thresholdLabel}
						</label>
						<input
							id="synthesis-threshold"
							type="number"
							className={styles.threshold__input}
							min={thresholdMin}
							max={thresholdMax}
							step={thresholdStep}
							value={thresholdValue}
							aria-invalid={!!errors.threshold}
							aria-describedby="synthesis-threshold-hint"
							disabled={panelDisabled}
							onChange={(e) => handleThresholdChange(Number(e.target.value))}
						/>
						<p id="synthesis-threshold-hint" className={styles.threshold__hint}>
							{thresholdHint}
						</p>
						{errors.threshold && (
							<p className={styles.threshold__error} role="alert">
								{errors.threshold}
							</p>
						)}
					</div>
				</section>

				{/* Advanced: similarity thresholds (collapsed by default) */}
				<section className={styles.card}>
					<button
						type="button"
						className={styles.disclosure}
						aria-expanded={advancedOpen}
						aria-controls="synthesis-advanced-body"
						onClick={() => setAdvancedOpen((v) => !v)}
					>
						<span className={styles.disclosure__title}>{t('Advanced: similarity thresholds')}</span>
						<span className={styles.disclosure__chevron} aria-hidden="true">
							{advancedOpen ? '–' : '+'}
						</span>
					</button>
					{advancedOpen && (
						<div id="synthesis-advanced-body" className={styles.advancedBody}>
							<p className={styles.advancedBody__note}>
								{t(
									'These knobs control when two options are considered the same idea. The defaults work for most questions — only change them if you know why.',
								)}
							</p>
							<div className={styles.fieldRow}>
								<label htmlFor="synthesis-attach" className={styles.fieldRow__label}>
									{t('Auto-attach if cosine ≥')}
								</label>
								<input
									id="synthesis-attach"
									type="number"
									className={styles.fieldRow__input}
									min={0}
									max={1}
									step={0.01}
									value={settings.attachThreshold}
									aria-invalid={!!errors.attachThreshold}
									disabled={panelDisabled}
									onChange={(e) => updateField('attachThreshold', Number(e.target.value))}
								/>
								{errors.attachThreshold && (
									<p className={styles.fieldRow__error} role="alert">
										{errors.attachThreshold}
									</p>
								)}
							</div>
							<div className={styles.fieldRow}>
								<label htmlFor="synthesis-review" className={styles.fieldRow__label}>
									{t('Send for review if cosine ≥')}
								</label>
								<input
									id="synthesis-review"
									type="number"
									className={styles.fieldRow__input}
									min={0.5}
									max={0.99}
									step={0.01}
									value={settings.reviewLowerBound}
									aria-invalid={!!errors.reviewLowerBound}
									disabled={panelDisabled}
									onChange={(e) => updateField('reviewLowerBound', Number(e.target.value))}
								/>
								{errors.reviewLowerBound && (
									<p className={styles.fieldRow__error} role="alert">
										{errors.reviewLowerBound}
									</p>
								)}
							</div>
						</div>
					)}
				</section>

				{/* Save settings — sticky inline action when dirty */}
				{dirty && (
					<div className={styles.saveBar} role="status">
						<span className={styles.saveBar__text}>{t('You have unsaved changes')}</span>
						<Button
							text={saving ? t('Saving…') : t('Save settings')}
							variant="primary"
							onClick={handleSave}
							disabled={saving || hasErrors}
							loading={saving}
						/>
					</div>
				)}

				{/* Run synthesis */}
				<section className={styles.card} aria-labelledby="synthesis-run-heading">
					<div className={styles.card__head}>
						<h3 id="synthesis-run-heading" className={styles.card__title}>
							{t('Run synthesis')}
						</h3>
						<p className={styles.card__subtitle}>
							{t(
								'"Synthesize" runs over every eligible option. "Re-judge" looks at existing clusters and merges any that drifted into semantic equivalence.',
							)}
						</p>
					</div>

					<div className={styles.runActions}>
						<Button
							text={t('Synthesize')}
							variant="primary"
							onClick={handleSynthesizeNow}
							disabled={!settings.enabled || isRunning || busyOp !== null || dirty}
						/>
						<Button
							text={t('Re-judge gray-band pairs')}
							variant="secondary"
							onClick={handleRejudge}
							disabled={!settings.enabled || busyOp !== null || dirty}
						/>
					</div>

					<SelectiveOptionsList
						questionId={statement.statementId}
						disabled={!settings.enabled || busyOp !== null || dirty}
						minEvaluators={settings.minEvaluators}
						minConsensus={settings.minConsensus}
						onResult={(result) => {
							setToast({
								tone: 'info',
								message: `${t('Queued')} ${result.enqueued} ${t('selected options')}`,
							});
						}}
					/>
				</section>

				{/* Status / progress */}
				<section className={styles.card} aria-labelledby="synthesis-status-heading">
					<div className={styles.card__head}>
						<h3 id="synthesis-status-heading" className={styles.card__title}>
							{t('Status')}
						</h3>
					</div>
					<SynthesisProgressBar
						progress={progress}
						onPause={handlePause}
						onResume={handleResume}
						onCancel={handleCancel}
						busy={busyOp !== null}
					/>
				</section>
			</div>

			{toast && (
				<div className={styles.toast} data-tone={toast.tone} role="status">
					{toast.message}
				</div>
			)}
		</section>
	);
};

export default SynthesisPanel;
