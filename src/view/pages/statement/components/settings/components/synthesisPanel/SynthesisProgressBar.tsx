import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { SynthesisProgress, SynthesisQueueOperation } from '@/controllers/db/synthesis/types';
import styles from './SynthesisProgressBar.module.scss';

interface Props {
	progress: SynthesisProgress | null;
	onPause: () => void;
	onResume: () => void;
	onCancel: () => void;
	busy: boolean;
}

const SynthesisProgressBar: FC<Props> = ({ progress, onPause, onResume, onCancel, busy }) => {
	const { t } = useTranslation();

	if (!progress || progress.status === 'idle') {
		return (
			<div className={styles.progress} data-status="idle" aria-live="polite">
				<div className={styles.progress__heading}>
					<span className={styles.progress__statusDot} aria-hidden="true" />
					<span className={styles.progress__title}>{t('No synthesis running')}</span>
				</div>
				<p className={styles.progress__subtitle}>
					{t('Trigger a run above to start clustering eligible options.')}
				</p>
			</div>
		);
	}

	const total = progress.enqueuedCount || 1;
	const done = progress.processedCount + progress.failedCount;
	const percent = Math.min(100, Math.round((done / total) * 100));

	const statusLabel = (() => {
		switch (progress.status) {
			case 'running':
				return t('Running');
			case 'paused':
				return t('Paused');
			case 'completed':
				return t('Completed');
			case 'failed':
				return t('Failed');
			case 'cancelled':
				return t('Cancelled');
			default:
				return progress.status;
		}
	})();

	const operationLabel = (op: SynthesisQueueOperation): string => {
		switch (op) {
			case 'synthesizeNow':
				return t('Running full synthesis');
			case 'selective':
				return t('Running selective synthesis');
			case 'rejudge':
				return t('Re-judging cluster pairs');
			case 'mixed':
				return t('Running synthesis (mixed)');
			default:
				return t('Running synthesis');
		}
	};

	const showPause = progress.status === 'running';
	const showResume = progress.status === 'paused';
	const showCancel = progress.status === 'running' || progress.status === 'paused';
	const isFinished =
		progress.status === 'completed' ||
		progress.status === 'failed' ||
		progress.status === 'cancelled';

	return (
		<div
			className={styles.progress}
			data-status={progress.status}
			role="status"
			aria-live="polite"
			aria-busy={progress.status === 'running'}
		>
			{/* Heading: status + operation + inline controls */}
			<div className={styles.progress__heading}>
				<span className={styles.progress__statusDot} aria-hidden="true" />
				<div className={styles.progress__headingText}>
					<span className={styles.progress__title}>{operationLabel(progress.operation)}</span>
					<span className={styles.progress__counts}>
						{`${progress.processedCount.toLocaleString()} / ${progress.enqueuedCount.toLocaleString()} ${t(
							'processed',
						)}`}
					</span>
				</div>
				<span className={styles.progress__badge}>{statusLabel}</span>
				{(showPause || showResume || showCancel) && (
					<div className={styles.progress__controls}>
						{showPause && (
							<button
								type="button"
								className={styles.controlButton}
								onClick={onPause}
								disabled={busy}
							>
								{t('Pause')}
							</button>
						)}
						{showResume && (
							<button
								type="button"
								className={styles.controlButton}
								onClick={onResume}
								disabled={busy}
							>
								{t('Resume')}
							</button>
						)}
						{showCancel && (
							<button
								type="button"
								className={styles.controlButton}
								data-tone="danger"
								onClick={onCancel}
								disabled={busy}
							>
								{t('Cancel')}
							</button>
						)}
					</div>
				)}
			</div>

			{/* Bar */}
			<div
				className={styles.bar}
				role="progressbar"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={statusLabel}
			>
				<div className={styles.bar__fill} style={{ inlineSize: `${percent}%` }}>
					{progress.status === 'running' && <div className={styles.bar__stripe} />}
				</div>
			</div>

			{/* Footer detail */}
			<div className={styles.progress__detail}>
				<span>
					<strong>{progress.pendingCount.toLocaleString()}</strong> {t('pending')}
				</span>
				{progress.failedCount > 0 && (
					<span className={styles.progress__detailError}>
						<strong>{progress.failedCount.toLocaleString()}</strong> {t('failed')}
					</span>
				)}
				{progress.status === 'running' && progress.etaMinutes > 0 && (
					<span>
						{t('ETA')}: <strong>{progress.etaMinutes}</strong> {t('min')}
					</span>
				)}
				{isFinished && progress.lastError && (
					<span className={styles.progress__detailError}>{progress.lastError}</span>
				)}
			</div>
		</div>
	);
};

export default SynthesisProgressBar;
