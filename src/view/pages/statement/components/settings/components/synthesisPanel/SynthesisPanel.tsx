import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { Statement } from '@freedi/shared-types';
import { saveSynthesisSettings } from '@/controllers/db/synthesis/saveSynthesisSettings';
import { listenSynthesisProgress } from '@/controllers/db/synthesis/listenSynthesisProgress';
import {
	synthesisCancel,
	synthesisPause,
	synthesisResume,
	triggerGlobalCluster,
	triggerReCluster,
	triggerReEmbed,
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
	clusterThreshold?: string;
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
		clusterThreshold:
			typeof raw.clusterThreshold === 'number'
				? raw.clusterThreshold
				: DEFAULT_SYNTHESIS_SETTINGS.clusterThreshold,
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
		if (!Number.isFinite(settings.minEvaluators) || settings.minEvaluators < 0) {
			errors.threshold = 'min 0';
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
		!Number.isFinite(settings.clusterThreshold) ||
		settings.clusterThreshold <= 0 ||
		settings.clusterThreshold > 1
	) {
		errors.clusterThreshold = 'range (0, 1]';
	}
	if (
		!Number.isFinite(settings.reviewLowerBound) ||
		settings.reviewLowerBound < 0 ||
		settings.reviewLowerBound >= 1
	) {
		errors.reviewLowerBound = 'range [0, 1)';
	}
	// Three-band invariant: review < cluster < attach.
	if (
		!errors.clusterThreshold &&
		!errors.attachThreshold &&
		settings.clusterThreshold >= settings.attachThreshold
	) {
		errors.clusterThreshold = '< synth threshold';
	}
	if (
		!errors.reviewLowerBound &&
		!errors.clusterThreshold &&
		settings.reviewLowerBound >= settings.clusterThreshold
	) {
		errors.reviewLowerBound = '< cluster threshold';
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
	// `enabled` no longer means "all of synthesis is off" — it gates ONLY the
	// continuous (background) triggers. On-demand actions and the eligibility
	// settings remain meaningful regardless, so we no longer dim the panel.
	const panelDisabled = false;

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
					prev.minEvaluators >= 0 ? prev.minEvaluators : DEFAULT_SYNTHESIS_SETTINGS.minEvaluators,
			}));
		} else {
			// Switching to consensus mode floors evaluators at 1 — the AND-gate
			// in the backend treats minEvaluators=0 the same as "no gate", so
			// we need a positive bound when consensus is the active metric.
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
		// On-demand is always available — no gate on settings.enabled (that
		// flag controls only continuous background synthesis).
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

	async function handleReCluster(): Promise<void> {
		const confirmed = window.confirm(
			t(
				'Re-cluster from scratch? This dissolves all current clusters for this question (restoring the original options) and rebuilds them. Use this if the clusters look wrong.',
			),
		);
		if (!confirmed) return;
		const result = await withBusy('recluster', () => triggerReCluster(statement.statementId));
		if (result) {
			setToast({
				tone: 'info',
				message: `${t('Cleared')} ${result.clustersReversed} ${t('clusters')} · ${t('Queued')} ${result.enqueued} ${t('options')} · ${t('ETA')} ${result.etaMinutes} ${t('min')}`,
			});
		}
	}

	async function handleGlobalCluster(): Promise<void> {
		const confirmed = window.confirm(
			t(
				'Global cluster from scratch? This dissolves all current clusters and re-groups every option in one pass, using the similarity thresholds below. Best after re-embedding.',
			),
		);
		if (!confirmed) return;
		const result = await withBusy('globalCluster', () =>
			triggerGlobalCluster(statement.statementId),
		);
		if (result) {
			setToast({
				tone: 'info',
				message: `${t('Created')} ${result.synthsCreated} ${t('synths')} · ${result.topicsCreated} ${t('topic clusters')} ${t('from')} ${result.eligibleOptions} ${t('options')}`,
			});
		}
	}

	async function handleReEmbed(): Promise<void> {
		const confirmed = window.confirm(
			t(
				'Re-embed all options? This regenerates every option’s embedding from its distilled gist. Run this once before clustering so the vectors are consistent. May take a minute.',
			),
		);
		if (!confirmed) return;
		const result = await withBusy('reembed', () => triggerReEmbed(statement.statementId));
		if (result) {
			setToast({
				tone: 'info',
				message: `${t('Re-embedded')} ${result.embedded} / ${result.total} ${t('options')}${result.failed ? ` · ${result.failed} ${t('failed')}` : ''}`,
			});
		}
	}

	async function handleRejudge(): Promise<void> {
		// On-demand is always available — no gate on settings.enabled.
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
	// 0 evaluators = "run immediately on every option create". The input
	// accepts 0 explicitly so admins can disable the engagement gate.
	const thresholdMin = metric === 'evaluators' ? 0 : 0;
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
									{t('Synth (near-duplicate) if cosine ≥')}
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
								<label htmlFor="synthesis-cluster" className={styles.fieldRow__label}>
									{t('Topic cluster if cosine ≥')}
								</label>
								<input
									id="synthesis-cluster"
									type="number"
									className={styles.fieldRow__input}
									min={0}
									max={1}
									step={0.01}
									value={settings.clusterThreshold}
									aria-invalid={!!errors.clusterThreshold}
									disabled={panelDisabled}
									onChange={(e) => updateField('clusterThreshold', Number(e.target.value))}
								/>
								{errors.clusterThreshold && (
									<p className={styles.fieldRow__error} role="alert">
										{errors.clusterThreshold}
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
									min={0}
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

				{/* Continuous (background) — status card with its OWN toggle.
					The on-demand card below stays available regardless of this toggle. */}
				<section className={styles.continuousCard} aria-labelledby="synthesis-continuous-heading">
					<div className={styles.continuousCard__head}>
						<div>
							<h3 id="synthesis-continuous-heading" className={styles.card__title}>
								{t('Continuous synthesis (background)')}
							</h3>
							<p className={styles.card__subtitle}>
								{t('Runs automatically as options arrive or cross the threshold.')}
							</p>
						</div>
						<Toggle
							id="synthesis-continuous-enabled"
							checked={settings.enabled}
							onChange={(checked) => updateField('enabled', checked)}
							label={settings.enabled ? t('On') : t('Off')}
							ariaLabel={t('Enable continuous synthesis')}
						/>
					</div>

					<div className={styles.continuousCard__row}>
						<span
							className={styles.statusDot}
							data-active={settings.enabled ? 'true' : 'false'}
							aria-hidden="true"
						/>
						<span
							className={styles.statusBadge}
							data-active={settings.enabled ? 'true' : 'false'}
							aria-live="polite"
						>
							{settings.enabled ? t('Active') : t('Idle')}
						</span>
					</div>

					<p className={styles.continuousCard__caption}>
						{settings.enabled
							? t('Triggers on every new option and on every threshold crossing.')
							: t('Continuous synthesis is off. On-demand actions below are still available.')}
					</p>
				</section>

				{/* On-demand — admin-initiated bulk operations */}
				<section className={styles.onDemandCard} aria-labelledby="synthesis-ondemand-heading">
					<div className={styles.card__head}>
						<h3 id="synthesis-ondemand-heading" className={styles.card__title}>
							{t('On-demand synthesis')}
						</h3>
						<p className={styles.card__subtitle}>
							{t('Trigger a clustering run on the existing backlog right now.')}
						</p>
					</div>

					<div className={styles.onDemandActions}>
						<Button
							text={t('Synthesize')}
							variant="primary"
							onClick={handleSynthesizeNow}
							disabled={isRunning || busyOp !== null || dirty}
						/>
						<Button
							text={t('Re-judge gray-band pairs')}
							variant="secondary"
							onClick={handleRejudge}
							disabled={busyOp !== null || dirty}
						/>
						<Button
							text={t('Re-cluster from scratch')}
							variant="secondary"
							onClick={handleReCluster}
							disabled={isRunning || busyOp !== null || dirty}
						/>
					</div>

					<div className={styles.onDemandActions}>
						<Button
							text={t('Re-embed options')}
							variant="secondary"
							onClick={handleReEmbed}
							disabled={isRunning || busyOp !== null || dirty}
						/>
						<Button
							text={t('Global cluster (one pass)')}
							variant="secondary"
							onClick={handleGlobalCluster}
							disabled={isRunning || busyOp !== null || dirty}
						/>
					</div>
					<p className={styles.card__subtitle}>
						{t(
							'Global cluster groups every option in one pass using the similarity thresholds below — tight groups become synths, looser ones topic clusters. Re-embed first for best results.',
						)}
					</p>

					<hr className={styles.onDemandCard__divider} />

					<SelectiveOptionsList
						questionId={statement.statementId}
						disabled={busyOp !== null || dirty}
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
					{isRunning || progress ? (
						<SynthesisProgressBar
							progress={progress}
							onPause={handlePause}
							onResume={handleResume}
							onCancel={handleCancel}
							busy={busyOp !== null}
						/>
					) : (
						<p className={styles.card__subtitle} aria-live="polite">
							{settings.enabled
								? t('Background synthesis is active. No on-demand runs queued.')
								: t('Synthesis is off. No background or on-demand runs are happening.')}
						</p>
					)}
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
