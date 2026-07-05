import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { DerivedActivity } from '@/controllers/events/deriveActivities';
import QRCodePanel from '@/view/components/qr/QRCodePanel';
import RunStatePill from './RunStatePill';
import styles from '../EventDashboard.module.scss';

interface ShareHubProps {
	activities: DerivedActivity[];
}

/**
 * Share Hub (Phase 1): one place for every activity's participant link + QR.
 * The single-link "Lobby router" that follows the facilitator's spotlight is a
 * later phase; here each activity is shared individually.
 */
const ShareHub: FC<ShareHubProps> = ({ activities }) => {
	const { t } = useTranslation();
	const shareable = activities.filter((a) => a.participant);
	const [selectedId, setSelectedId] = useState<string>(shareable[0]?.statementId ?? '');

	if (shareable.length === 0) {
		return (
			<aside className={styles.shareHub}>
				<h2 className={styles.shareHub__title}>{t('Share Hub')}</h2>
				<p className={styles.shareHub__empty}>{t('No shareable activities yet')}</p>
			</aside>
		);
	}

	const selected = shareable.find((a) => a.statementId === selectedId) ?? shareable[0];

	return (
		<aside className={styles.shareHub}>
			<h2 className={styles.shareHub__title}>{t('Share Hub')}</h2>

			<ul className={styles.shareHub__list}>
				{shareable.map((activity) => {
					const isSelected = activity.statementId === selected.statementId;

					return (
						<li key={activity.statementId}>
							<button
								type="button"
								className={`${styles.shareHub__item} ${
									isSelected ? styles['shareHub__item--selected'] : ''
								}`}
								onClick={() => setSelectedId(activity.statementId)}
							>
								<span className={styles.shareHub__itemIcon} aria-hidden="true">
									{activity.def.icon}
								</span>
								<span className={styles.shareHub__itemTitle}>
									{activity.title || t('Untitled')}
								</span>
								<RunStatePill state={activity.runState} />
							</button>
						</li>
					);
				})}
			</ul>

			{selected.participant && (
				<div className={styles.shareHub__qr}>
					<QRCodePanel url={selected.participant.href} title={selected.title} />
				</div>
			)}
		</aside>
	);
};

export default ShareHub;
