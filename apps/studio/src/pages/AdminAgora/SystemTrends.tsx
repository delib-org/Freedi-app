import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { systemContext } from '@freedi/shared-charts';
import { useSupervisorConsole, backfillTeacherLessons } from '@/db/agoraSupervisor';
import { Button } from '@/components/atomic/atoms';
import IndicatorGrid from '@/components/atomic/molecules/Chart/IndicatorGrid';
import { logError } from '@/utils/logError';
import { PeriodPicker } from './SupervisionSections';

export default function SystemTrends() {
	const { t } = useTranslation();
	const [days, setDays] = useState(90);
	const { data, loading, error, refresh } = useSupervisorConsole({ view: 'system', days });
	const [busy, setBusy] = useState(false);
	const [folded, setFolded] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	async function backfill(): Promise<void> {
		if (busy) return;
		setBusy(true);
		setFailed(false);
		setFolded(0);
		let cursor;
		try {
			do {
				const page = await backfillTeacherLessons({ ...(cursor ? { cursor } : {}), limit: 100 });
				setFolded((n) => (n ?? 0) + page.folded);
				cursor = page.nextCursor;
			} while (cursor);
			refresh();
		} catch (error) {
			logError(error, { operation: 'SystemTrends.backfill' });
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section>
			<h2>{t('Trends')}</h2>
			<PeriodPicker days={days} onChange={setDays} />
			{loading && <p role="status">{t('Loading…')}</p>}
			{error && <p role="alert">{t('Could not load supervision data.')}</p>}
			{data && <IndicatorGrid scope="system" context={systemContext(data)} />}
			<details>
				<summary>{t('Historical lesson data')}</summary>
				<p>
					{t('Import previously finished lessons into teacher analytics. This is safe to resume.')}
				</p>
				<Button
					text={t(busy ? 'Importing…' : 'Backfill teacher lessons')}
					disabled={busy}
					onClick={() => void backfill()}
				/>
				{folded !== null && (
					<p role="status">
						{t('Lessons imported')}: {folded}
					</p>
				)}
				{failed && <p role="alert">{t('Import failed. Retry to resume.')}</p>}
			</details>
		</section>
	);
}
