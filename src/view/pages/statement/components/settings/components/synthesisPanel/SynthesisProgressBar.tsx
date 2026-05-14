import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { SynthesisProgress } from '@/controllers/db/synthesis/types';
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
			<div className={styles.progressBar} aria-live="polite">
				<div className={styles.heading}>
					<span>{t('No synthesis running')}</span>
				</div>
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

	const showPause = progress.status === 'running';
	const showResume = progress.status === 'paused';
	const showCancel = progress.status === 'running' || progress.status === 'paused';

	return (
		<div
			className={styles.progressBar}
			role="status"
			aria-live="polite"
			aria-busy={progress.status === 'running'}
		>
			<div className={styles.heading}>
				<span>
					{progress.processedCount.toLocaleString()} / {progress.enqueuedCount.toLocaleString()}{' '}
					{t('processed')}
				</span>
				<span className={styles.statusBadge} data-status={progress.status}>
					{statusLabel}
				</span>
			</div>

			<div
				className={styles.bar}
				role="progressbar"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
			>
				<div className={styles.fill} style={{ width: `${percent}%` }} />
			</div>

			<div className={styles.detail}>
				<span>
					{t('Pending')}: {progress.pendingCount.toLocaleString()}
				</span>
				{progress.failedCount > 0 && (
					<span>
						{t('Failed')}: {progress.failedCount.toLocaleString()}
					</span>
				)}
				{progress.status === 'running' && progress.etaMinutes > 0 && (
					<span>
						{t('ETA')}: {progress.etaMinutes} {t('min')}
					</span>
				)}
			</div>

			{(showPause || showResume || showCancel) && (
				<div className={styles.controls}>
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
	);
};

export default SynthesisProgressBar;
