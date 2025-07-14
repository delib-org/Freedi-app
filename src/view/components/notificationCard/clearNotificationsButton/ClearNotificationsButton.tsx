import { clearAllInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button from '../../buttons/button/Button';
import styles from './ClearNotificationsButton.module.scss';

const ClearNotificationsButton = () => {
	const handleClear = async () => {
		await clearAllInAppNotifications();
	};
	const { t } = useUserConfig();

	return (
		<Button
			className={styles.clearButton}
			text={t('Clear All Notifications')}
			onClick={handleClear}
		/>
	);
};

export default ClearNotificationsButton;
