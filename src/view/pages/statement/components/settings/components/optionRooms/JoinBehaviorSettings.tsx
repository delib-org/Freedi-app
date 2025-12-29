import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './OptionRooms.module.scss';

interface JoinBehaviorSettingsProps {
	joiningEnabled: boolean;
	singleJoinOnly: boolean;
	onJoiningEnabledChange: (enabled: boolean) => void;
	onSingleJoinOnlyChange: (singleOnly: boolean) => void;
}

const JoinBehaviorSettings: FC<JoinBehaviorSettingsProps> = ({
	joiningEnabled,
	singleJoinOnly,
	onJoiningEnabledChange,
	onSingleJoinOnlyChange,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles.optionRooms__subsection}>
			<h3 className={styles.optionRooms__subsectionTitle}>
				{t('Join Behavior')}
			</h3>
			<p className={styles.optionRooms__subsectionDescription}>
				{t('How participants can join options')}
			</p>

			<div className={styles.optionRooms__toggleRow}>
				<label className={styles.optionRooms__toggleLabel}>
					<input
						type="checkbox"
						checked={joiningEnabled}
						onChange={(e) => onJoiningEnabledChange(e.target.checked)}
						className={styles.optionRooms__checkbox}
					/>
					<span>{t('Enable joining options')}</span>
				</label>
			</div>

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
