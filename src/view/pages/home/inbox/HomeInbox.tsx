import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleHelp, FileCheck2, Lightbulb, MessageCircle } from 'lucide-react';
import { NotificationType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';
import {
	clearAllInAppNotificationsDB,
	markMultipleNotificationsAsReadDB,
	markNotificationAsReadDB,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import NotificationDeliveryControls from '@/view/components/notifications/NotificationDeliveryControls';
import { logError } from '@/utils/errorHandling';
import {
	filterInbox,
	formatRelativeTime,
	inboxDestination,
	INBOX_FILTERS,
	InboxFilter,
	InboxKind,
	inboxKind,
} from './inboxModel';
import styles from './HomeInbox.module.scss';

const GLYPHS: Record<InboxKind, React.ReactNode> = {
	agreement: <FileCheck2 size={18} aria-hidden="true" />,
	chat: <MessageCircle size={18} aria-hidden="true" />,
	answer: <Lightbulb size={18} aria-hidden="true" />,
	question: <CircleHelp size={18} aria-hidden="true" />,
};

/** תיבה — the in-app notifications as a tab-level screen. */
export default function HomeInbox() {
	const { t, currentLanguage } = useTranslation();
	const navigate = useNavigate();
	const creator = useAppSelector(creatorSelector);
	const all = useAppSelector(inAppNotificationsSelector);
	const [filter, setFilter] = useState<InboxFilter>('all');
	const notifications = useMemo(
		() =>
			relevantNotifications(all, creator?.uid)
				.slice()
				.sort((a, b) => b.createdAt - a.createdAt),
		[all, creator?.uid],
	);
	const visible = useMemo(() => filterInbox(notifications, filter), [notifications, filter]);
	const unreadIds = notifications.filter((n) => !n.read).map((n) => n.notificationId);
	const now = Date.now();

	async function markAllRead() {
		try {
			if (unreadIds.length) await markMultipleNotificationsAsReadDB(unreadIds);
		} catch (error) {
			logError(error, { operation: 'home.HomeInbox.markAllRead', userId: creator?.uid });
		}
	}

	async function clearMailbox() {
		try {
			await clearAllInAppNotificationsDB();
		} catch (error) {
			logError(error, { operation: 'home.HomeInbox.clearMailbox', userId: creator?.uid });
		}
	}

	function open(notification: NotificationType) {
		if (!notification.read) {
			markNotificationAsReadDB(notification.notificationId).catch((error: unknown) =>
				logError(error, {
					operation: 'home.HomeInbox.open',
					userId: creator?.uid,
					metadata: { notificationId: notification.notificationId },
				}),
			);
		}
		navigate(inboxDestination(notification));
	}

	return (
		<section className={styles.inbox} aria-labelledby="home-inbox-title" data-testid="home-inbox">
			<div className={styles.inbox__head}>
				<h1 id="home-inbox-title" className={styles.inbox__title}>
					{t('Inbox')}
				</h1>
				<button
					type="button"
					className={styles.inbox__link}
					onClick={markAllRead}
					disabled={unreadIds.length === 0}
					data-testid="inbox-mark-all-read"
				>
					{t('Mark as read')}
				</button>
			</div>
			<div className={styles.inbox__filters} role="group" aria-label={t('Filter notifications')}>
				{INBOX_FILTERS.map((item) => (
					<button
						key={item.id}
						type="button"
						aria-pressed={filter === item.id}
						className={`${styles.inbox__pill} ${filter === item.id ? styles['inbox__pill--active'] : ''}`}
						onClick={() => setFilter(item.id)}
						data-testid={`inbox-filter-${item.id}`}
					>
						{t(item.labelKey)}
					</button>
				))}
			</div>
			{visible.length === 0 ? (
				<p className={styles.inbox__empty}>{t('You have no new notifications')}</p>
			) : (
				<ul className={styles.inbox__list}>
					{visible.map((notification) => {
						const kind = inboxKind(notification);
						const context =
							notification.parentStatement && notification.parentStatement !== 'top'
								? notification.parentStatement
								: undefined;
						const meta = [context, formatRelativeTime(notification.createdAt, now, currentLanguage)]
							.filter(Boolean)
							.join(' · ');

						return (
							<li key={notification.notificationId}>
								<button
									type="button"
									className={`${styles.inbox__row} ${notification.read ? '' : styles['inbox__row--unread']}`}
									onClick={() => open(notification)}
									data-testid="inbox-row"
								>
									<span className={styles.inbox__glyph} data-kind={kind}>
										{GLYPHS[kind]}
									</span>
									<span className={styles.inbox__body}>
										<span className={styles.inbox__text}>
											{notification.title || notification.creatorName}
											{notification.text ? `: ${notification.text}` : ''}
										</span>
										<span className={styles.inbox__meta}>{meta}</span>
									</span>
									<span
										className={styles.inbox__dot}
										aria-label={notification.read ? undefined : t('unread')}
										role={notification.read ? undefined : 'img'}
									/>
								</button>
							</li>
						);
					})}
				</ul>
			)}
			{notifications.length > 0 && (
				<button
					type="button"
					className={styles.inbox__clear}
					onClick={clearMailbox}
					data-testid="inbox-clear"
				>
					{t('Clear mailbox')}
				</button>
			)}
			<div className={styles.inbox__delivery}>
				<NotificationDeliveryControls />
			</div>
		</section>
	);
}
