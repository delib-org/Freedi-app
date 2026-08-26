import { useState, type FC } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { logError } from '@/utils/logError';
import { followMePathFor, setJoinFollowMe } from '../db/followMe';
import styles from './FollowMeToggle.module.scss';

/** FollowMeToggle — steer every participant in the room to this activity. */
export interface FollowMeToggleProps {
	topId: string;
	activityId: string;
	/** Live value from the top statement. */
	active: boolean;
}

const FollowMeToggle: FC<FollowMeToggleProps> = ({ topId, activityId, active }) => {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const toggle = async () => {
		setBusy(true);
		setError('');
		try {
			await setJoinFollowMe(topId, active ? '' : followMePathFor(activityId));
		} catch (err) {
			logError(err, {
				operation: 'FollowMeToggle.toggle',
				statementId: topId,
				metadata: { activityId, active },
			});
			setError(t('Could not update follow me. Please try again.'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={styles.followMe}>
			<button
				type="button"
				className={clsx(styles.toggle, active && styles.toggleOn)}
				aria-pressed={active}
				disabled={busy}
				onClick={() => void toggle()}
			>
				<span className={styles.track} aria-hidden="true">
					<span className={styles.thumb} />
				</span>
				<span className={styles.label}>{t('Follow me')}</span>
			</button>
			<p className={styles.hint}>
				{active
					? t('Participants are being steered to this activity.')
					: t('Participants browse the hub freely.')}
			</p>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
		</div>
	);
};

export default FollowMeToggle;
