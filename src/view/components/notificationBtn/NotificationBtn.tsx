import MailIcon from '@/assets/icons/mailIcon.svg?react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import InAppNotifications from '../inAppNotifications/InAppNotifications';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './NotificationBtn.module.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import UnreadBadge from '../unreadBadge/UnreadBadge';

const NotificationBtn = () => {
	const creator = useSelector(creatorSelector);
	const notifications = useSelector(inAppNotificationsSelector);
	const unreadCount = relevantNotifications(notifications, creator?.uid).filter(
		(n) => !n.read,
	).length;
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();
	const close = useCallback(() => setOpen(false), []);
	const wrapperRef = useClickOutside(close);
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape' && open) {
				close();
				buttonRef.current?.focus();
			}
		};
		document.addEventListener('keydown', onKey);

		return () => document.removeEventListener('keydown', onKey);
	}, [open, close]);

	return (
		<div className={styles.notificationBtn} ref={wrapperRef}>
			<button
				type="button"
				ref={buttonRef}
				className={styles.notificationBtn__trigger}
				aria-label={`${t('Notifications')}${unreadCount ? `: ${unreadCount} ${t('unread')}` : ''}`}
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				onClick={() => setOpen(!open)}
			>
				<MailIcon />
				<UnreadBadge
					count={unreadCount}
					maxDisplay={99}
					position="absolute"
					ariaLabel={`${unreadCount} ${t('unread')}`}
				/>
			</button>
			{open && (
				<div
					id={panelId}
					onClick={(event) => {
						if ((event.target as Element).closest('a')) close();
					}}
				>
					<InAppNotifications onClose={close} />
				</div>
			)}
		</div>
	);
};
export default NotificationBtn;
