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
import SynthesisProgressBar from './SynthesisProgressBar';
import SelectiveOptionsList from './SelectiveOptionsList';
import styles from './SynthesisPanel.module.scss';

interface Props {
	statement: Statement;
}

interface FieldErrors {
	minEvaluators?: string;
	minConsensus?: string;
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

function validateFields(settings: SynthesisSettings): FieldErrors {
	const errors: FieldErrors = {};
	if (!Number.isFinite(settings.minEvaluators) || settings.minEvaluators < 1) {
		errors.minEvaluators = 'min 1';
	}
	if (
		!Number.isFinite(settings.minConsensus) ||
		settings.minConsensus < 0 ||
		settings.minConsensus > 1
	) {
		errors.minConsensus = 'range 0–1';
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
	const [progress, setProgress] = useState<SynthesisProgress | null>(null);
	const [saving, setSaving] = useState(false);
	const [busyOp, setBusyOp] = useState<string | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		const unsub = listenSynthesisProgress(statement.statementId, setProgress);

		return () => unsub();
	}, [statement.statementId]);

	useEffect(() => {
		if (!toast) return;
		const id = setTimeout(() => setToast(null), 5000);

		return () => clearTimeout(id);
	}, [toast]);

	const errors = validateFields(settings);
	const hasErrors = Object.values(errors).some(Boolean);
	const isRunning = progress?.status === 'running' || progress?.status === 'paused';

	function updateField<K extends keyof SynthesisSettings>(
		key: K,
		value: SynthesisSettings[K],
	): void {
		setSettings((prev) => ({ ...prev, [key]: value }));
		setDirty(true);
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

	return (
		<section className={styles.synthesisPanel} aria-labelledby="synthesis-panel-heading">
			<h2 id="synthesis-panel-heading" className={styles.sectionHeader}>
				{t('Synthesis')}
			</h2>

			<div className={styles.section}>
				<div className={styles.toggleRow}>
					<label htmlFor="synthesis-enabled">{t('Enable synthesis on this question')}</label>
					<input
						id="synthesis-enabled"
						type="checkbox"
						checked={settings.enabled}
						onChange={(e) => updateField('enabled', e.target.checked)}
					/>
				</div>
				<p className={styles.sectionHint}>
					{t(
						'When enabled, options are clustered automatically as they cross the engagement thresholds below.',
					)}
				</p>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionHeader}>{t('Engagement thresholds')}</div>
				<div className={styles.field}>
					<label htmlFor="synthesis-minEvaluators">{t('Minimum evaluators per option')}</label>
					<input
						id="synthesis-minEvaluators"
						type="number"
						min={1}
						step={1}
						value={settings.minEvaluators}
						aria-invalid={!!errors.minEvaluators}
						onChange={(e) => updateField('minEvaluators', Number(e.target.value))}
					/>
					{errors.minEvaluators && <p className={styles.fieldError}>{errors.minEvaluators}</p>}
				</div>
				<div className={styles.field}>
					<label htmlFor="synthesis-minConsensus">{t('Minimum consensus per option')} (0–1)</label>
					<input
						id="synthesis-minConsensus"
						type="number"
						min={0}
						max={1}
						step={0.05}
						value={settings.minConsensus}
						aria-invalid={!!errors.minConsensus}
						onChange={(e) => updateField('minConsensus', Number(e.target.value))}
					/>
					{errors.minConsensus && <p className={styles.fieldError}>{errors.minConsensus}</p>}
				</div>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionHeader}>{t('Similarity thresholds (advanced)')}</div>
				<div className={styles.field}>
					<label htmlFor="synthesis-attach">{t('Auto-attach if cosine ≥')}</label>
					<input
						id="synthesis-attach"
						type="number"
						min={0}
						max={1}
						step={0.01}
						value={settings.attachThreshold}
						aria-invalid={!!errors.attachThreshold}
						onChange={(e) => updateField('attachThreshold', Number(e.target.value))}
					/>
					{errors.attachThreshold && <p className={styles.fieldError}>{errors.attachThreshold}</p>}
				</div>
				<div className={styles.field}>
					<label htmlFor="synthesis-review">{t('Send for review if cosine ≥')}</label>
					<input
						id="synthesis-review"
						type="number"
						min={0.5}
						max={0.99}
						step={0.01}
						value={settings.reviewLowerBound}
						aria-invalid={!!errors.reviewLowerBound}
						onChange={(e) => updateField('reviewLowerBound', Number(e.target.value))}
					/>
					{errors.reviewLowerBound && (
						<p className={styles.fieldError}>{errors.reviewLowerBound}</p>
					)}
				</div>
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.primaryAction}
						onClick={handleSave}
						disabled={saving || hasErrors || !dirty}
					>
						{saving ? t('Saving…') : t('Save settings')}
					</button>
				</div>
			</div>

			<div className={styles.section}>
				<div className={styles.sectionHeader}>{t('Run synthesis')}</div>
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.primaryAction}
						onClick={handleSynthesizeNow}
						disabled={!settings.enabled || isRunning || busyOp !== null || dirty}
					>
						{t('Synthesize')}
					</button>
					<button
						type="button"
						className={styles.secondaryAction}
						onClick={handleRejudge}
						disabled={!settings.enabled || busyOp !== null || dirty}
					>
						{t('Re-judge gray-band pairs')}
					</button>
				</div>
				<p className={styles.sectionHint}>
					{t(
						'"Synthesize" runs over every eligible option. "Re-judge" looks at existing clusters and merges any that drifted into semantic equivalence.',
					)}
				</p>
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
			</div>

			<div className={styles.section}>
				<div className={styles.sectionHeader}>{t('Status')}</div>
				<SynthesisProgressBar
					progress={progress}
					onPause={handlePause}
					onResume={handleResume}
					onCancel={handleCancel}
					busy={busyOp !== null}
				/>
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
