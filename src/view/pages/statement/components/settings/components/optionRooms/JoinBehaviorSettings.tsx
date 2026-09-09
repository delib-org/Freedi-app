import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './OptionRooms.module.scss';

interface JoinBehaviorSettingsProps {
	/** Read from the statement; the switch itself lives in Participation rules. */
	joiningEnabled: boolean;
	singleJoinOnly: boolean;
	onSingleJoinOnlyChange: (singleOnly: boolean) => void;
}

const JoinBehaviorSettings: FC<JoinBehaviorSettingsProps> = ({
	joiningEnabled,
	singleJoinOnly,
	onSingleJoinOnlyChange,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>{t('Join Behavior')}</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{t('How participants can join options')}
			</p>

			{!joiningEnabled && (
				<p className={styles.optionRooms__subsectionDescription}>{t('host.joiningOffHint')}</p>
			)}

			{joiningEnabled && (
				<div className={styles.optionRooms__radioGroup}>
					<label className={styles.optionRooms__radioLabel}>
						<input
							type="radio"
							name="joinMode"
							checked={!singleJoinOnly}
							onChange={() => onSingleJoinOnlyChange(false)}
							className={styles.optionRooms__radio}
						/>
						<span>{t('Allow joining multiple options')}</span>
					</label>
					<label className={styles.optionRooms__radioLabel}>
						<input
							type="radio"
							name="joinMode"
							checked={singleJoinOnly}
							onChange={() => onSingleJoinOnlyChange(true)}
							className={styles.optionRooms__radio}
						/>
						<span>{t('Single option only (user commits to one)')}</span>
					</label>
				</div>
			)}
		</div>
	);
};

export default JoinBehaviorSettings;
