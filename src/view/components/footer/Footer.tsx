import { FC } from 'react';
// icons
import AddIcon from '@/assets/icons/plusIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';
import TargetIcon from '@/assets/icons/target.svg?react';
import styles from './Footer.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationType } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	subPage: 'decisions' | 'topics';
	setSubPage: (page: 'decisions' | 'topics') => void;
	hasTopics: boolean;
	onAddStatement: () => void;
}

const Footer: FC<Props> = ({ setSubPage, subPage, hasTopics, onAddStatement }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const inAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(
		(n) => n.creatorId !== creator?.uid,
	);

	if (!hasTopics) {
		return (
			<button onClick={onAddStatement} className={styles.fab} data-cy="add-statement">
				<AddIcon />
			</button>
		);
	}

	return (
		<div className={styles.footer} data-cy="add-statement">
			<button onClick={onAddStatement} className={styles.addStatementButton}>
				<AddIcon />
			</button>
			<button
				onClick={() => setSubPage('decisions')}
				className={`${styles.button} ${subPage === 'decisions' ? styles.buttonActive : ''}`}
			>
				<div
					className={`${styles.buttonImage} ${subPage === 'decisions' ? styles.buttonImageActive : ''}`}
				>
					{inAppNotificationsList.length > 0 && (
						<div className={styles.redCircle}>
							{inAppNotificationsList.length < 10 ? inAppNotificationsList.length : `9+`}
						</div>
					)}
					<div className={styles.buttonIcon}>
						<TargetIcon />
					</div>
				</div>
				<span className={`${subPage === 'decisions' ? styles.activeText : ''}`}>
					{t('Discussions')}
				</span>
			</button>
			<button
				onClick={() => setSubPage('topics')}
				className={`${styles.button} ${subPage === 'topics' ? styles.buttonActive : ''}`}
			>
				<div className={styles.buttonIcon}>
					<GroupIcon />
				</div>
				<span className={`${subPage === 'topics' ? styles.activeText : ''}`}>{t('Topics')}</span>
			</button>
		</div>
	);
};

export default Footer;
