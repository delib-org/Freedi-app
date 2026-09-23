import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { BackfillTeacherAggregatesRequest } from '@freedi/shared-types';
import { backfillTeacherAggregates } from '@/db/agoraSupervisorFunctions';
import { Button } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './AdminAgora.module.scss';

const PAGE_LIMIT = 200;

interface Totals {
	processed: number;
	folded: number;
	skipped: number;
}

const ZERO: Totals = { processed: 0, folded: 0, skipped: 0 };

/**
 * "Backfill teacher lessons": folds games that finished before teacher
 * aggregates existed. Confirmed in a dialog (never `window.confirm`), then
 * pages through `nextCursor` until the server says it is done; the same
 * dialog reports the running totals and the final count.
 */
export default function BackfillLessons() {
	const { t, tWithParams } = useTranslation();
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<'confirm' | 'running' | 'done' | 'failed'>('confirm');
	const [totals, setTotals] = useState<Totals>(ZERO);

	const close = () => {
		if (phase === 'running') return;
		setOpen(false);
		setPhase('confirm');
		setTotals(ZERO);
	};

	const run = async () => {
		setPhase('running');
		setTotals(ZERO);
		let cursor: BackfillTeacherAggregatesRequest['cursor'];
		try {
			do {
				const page = await backfillTeacherAggregates({
					limit: PAGE_LIMIT,
					...(cursor ? { cursor } : {}),
				});
				setTotals((sum) => ({
					processed: sum.processed + page.processed,
					folded: sum.folded + page.folded,
					skipped: sum.skipped + page.skipped,
				}));
				cursor = page.nextCursor;
			} while (cursor);
			setPhase('done');
		} catch (error) {
			logError(error, { operation: 'BackfillLessons.run' });
			setPhase('failed');
		}
	};

	const summary = tWithParams(
		'{{folded}} lessons imported, {{skipped}} skipped, {{processed}} read.',
		{
			...totals,
		},
	);

	return (
		<>
			<Button
				text={t('Backfill teacher lessons')}
				variant="secondary"
				onClick={() => setOpen(true)}
			/>
			{open && (
				<SimpleModal
					title={t('Backfill teacher lessons')}
					onClose={close}
					busy={phase === 'running'}
					footer={
						phase === 'confirm' ? (
							<>
								<Button text={t('Cancel')} variant="secondary" onClick={close} />
								<Button text={t('Start import')} variant="primary" onClick={() => void run()} />
							</>
						) : phase === 'failed' ? (
							<>
								<Button text={t('Close')} variant="secondary" onClick={close} />
								<Button text={t('Retry')} variant="primary" onClick={() => void run()} />
							</>
						) : (
							<Button
								text={t('Close')}
								variant="primary"
								disabled={phase === 'running'}
								onClick={close}
							/>
						)
					}
				>
					<div className={styles.form}>
						{phase === 'confirm' && (
							<p className={styles.meta}>
								{t(
									'Import previously finished lessons into teacher analytics. This is safe to resume.',
								)}
							</p>
						)}
						{phase !== 'confirm' && (
							<p role="status" aria-live="polite">
								{phase === 'running' ? `${t('Importing…')} ${summary}` : summary}
							</p>
						)}
						{phase === 'failed' && (
							<p className={styles.error}>{t('Import failed. Retry to resume.')}</p>
						)}
					</div>
				</SimpleModal>
			)}
		</>
	);
}
