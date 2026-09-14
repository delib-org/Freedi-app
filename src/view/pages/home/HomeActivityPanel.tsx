import { useMemo } from 'react';
import { ArrowUpRight, Bell, FileCheck2, MessageCircle, Plus, Sparkles } from 'lucide-react';
import {
	NotificationType,
	Statement,
	StatementSubscription,
	StatementType,
} from '@freedi/shared-types';
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import {
	statementsSelector,
	statementsSubscriptionsSelector,
} from '@/redux/statements/statementsSlice';
import {
	setNewStatementType,
	setParentStatement,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { markNotificationAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { notificationDestination, relevantNotifications } from '@/utils/engagementNavigation';
import styles from './HomeActivityPanel.module.scss';

type ActivityKind = 'notification' | 'conversation' | 'agreement';

export interface HomeActivityItem {
	id: string;
	kind: ActivityKind;
	title: string;
	context?: string;
	author?: string;
	createdAt: number;
	path: string;
	unread?: boolean;
	notificationId?: string;
}

interface BuildHomeActivityItemsArgs {
	notifications: NotificationType[];
	subscriptions: StatementSubscription[];
	statements: Statement[];
	userId?: string;
}

const isConversation = (subscription: StatementSubscription): boolean =>
	(subscription.parentId || subscription.statement?.parentId) === 'top' &&
	!subscription.isDocument &&
	![StatementType.document, StatementType.paragraph].includes(
		subscription.statementType || subscription.statement.statementType,
	);

const isAgreement = (statement: Pick<Statement, 'statementType' | 'agreementMeta'>): boolean =>
	statement.statementType === StatementType.agreement || Boolean(statement.agreementMeta);

/** Combines the already-loaded home data into a small, useful discovery feed. */
function buildHomeActivityItems({
	notifications,
	subscriptions,
	statements,
	userId,
}: BuildHomeActivityItemsArgs): HomeActivityItem[] {
	const conversationSubscriptions = subscriptions.filter(
		(subscription) => subscription.userId === userId && isConversation(subscription),
	);
	const subscribedRootIds = new Set(
		conversationSubscriptions.map(({ statementId }) => statementId),
	);
	const coveredStatementIds = new Set<string>();

	const notificationItems = relevantNotifications(notifications, userId)
		.slice()
		.sort((a, b) => Number(a.read) - Number(b.read) || b.createdAt - a.createdAt)
		.slice(0, 3)
		.map<HomeActivityItem>((notification) => {
			coveredStatementIds.add(notification.statementId);

			return {
				id: `notification-${notification.notificationId}`,
				kind: notification.statementType === StatementType.agreement ? 'agreement' : 'notification',
				title: notification.title || notification.text,
				context:
					notification.title && notification.text !== notification.title
						? notification.text
						: notification.parentStatement,
				author: notification.creatorName,
				createdAt: notification.createdAt,
				path: notificationDestination(notification),
				unread: !notification.read,
				notificationId: notification.notificationId,
			};
		});

	const agreementItems = statements
		.filter(
			(statement) =>
				isAgreement(statement) &&
				subscribedRootIds.has(
					statement.topParentId === 'top' ? statement.statementId : statement.topParentId,
				),
		)
		.map<HomeActivityItem>((statement) => {
			const rootId =
				statement.topParentId === 'top' ? statement.statementId : statement.topParentId;
			coveredStatementIds.add(statement.statementId);

			return {
				id: `agreement-${statement.statementId}`,
				kind: 'agreement',
				title: statement.statement,
				context: statement.description || statement.brief,
				author: statement.creator?.displayName,
				createdAt: statement.createdAt || statement.lastUpdate || 0,
				path: `/statement/${encodeURIComponent(rootId)}?tab=covenant`,
			};
		});

	const recentConversationItems = conversationSubscriptions.flatMap<HomeActivityItem>(
		(subscription) => {
			const recent = (
				subscription.statement.lastSubStatements ||
				subscription.lastSubStatements ||
				[]
			)
				.filter(
					(statement) =>
						statement.creatorId !== userId &&
						![StatementType.document, StatementType.paragraph].includes(statement.statementType) &&
						!coveredStatementIds.has(statement.statementId),
				)
				.slice()
				.sort((a, b) => (b.createdAt || b.lastUpdate || 0) - (a.createdAt || a.lastUpdate || 0))[0];

			if (!recent) return [];
			coveredStatementIds.add(recent.statementId);

			return [
				{
					id: `conversation-${recent.statementId}`,
					kind: recent.statementType === StatementType.agreement ? 'agreement' : 'conversation',
					title: recent.statement,
					context: subscription.statement.statement,
					author: recent.creator?.displayName,
					createdAt: recent.createdAt || recent.lastUpdate || subscription.lastUpdate || 0,
					path:
						recent.statementType === StatementType.agreement
							? `/statement/${encodeURIComponent(subscription.statementId)}?tab=covenant`
							: `/statement/${encodeURIComponent(subscription.statementId)}?tab=chat#${encodeURIComponent(recent.statementId)}`,
				},
			];
		},
	);

	const remainingItems = [...agreementItems, ...recentConversationItems]
		.filter((item, index, items) => items.findIndex(({ id }) => id === item.id) === index)
		.sort((a, b) => b.createdAt - a.createdAt)
		.slice(0, 6 - notificationItems.length);

	return [...notificationItems, ...remainingItems];
}

function relativeTime(timestamp: number, locale: string): string {
	if (!timestamp) return '';
	const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
	const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		['year', 31_536_000],
		['month', 2_592_000],
		['week', 604_800],
		['day', 86_400],
		['hour', 3_600],
		['minute', 60],
	];
	const [unit, seconds] = ranges.find(([, range]) => Math.abs(elapsedSeconds) >= range) || [
		'second',
		1,
	];

	return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
		Math.round(elapsedSeconds / seconds),
		unit,
	);
}

export default function HomeActivityPanel() {
	const { t, currentLanguage } = useTranslation();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const user = useAppSelector(creatorSelector);
	const notifications = useAppSelector(inAppNotificationsSelector);
	const subscriptions = useAppSelector(statementsSubscriptionsSelector);
	const statements = useAppSelector(statementsSelector);
	const items = useMemo(
		() => buildHomeActivityItems({ notifications, subscriptions, statements, userId: user?.uid }),
		[notifications, statements, subscriptions, user?.uid],
	);

	const createActivity = (): void => {
		dispatch(setParentStatement('top'));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
		navigate('/home');
	};

	const openItem = (item: HomeActivityItem): void => {
		if (item.notificationId && item.unread) {
			void markNotificationAsReadDB(item.notificationId);
		}
		navigate(item.path);
	};

	const iconFor = (kind: ActivityKind) => {
		if (kind === 'agreement') return <FileCheck2 size={17} />;
		if (kind === 'conversation') return <MessageCircle size={17} />;

		return <Bell size={17} />;
	};

	const labelFor = (kind: ActivityKind): string => {
		if (kind === 'agreement') return t('homeActivity.agreement');
		if (kind === 'conversation') return t('homeActivity.conversation');

		return t('homeActivity.notification');
	};

	return (
		<section className={styles.panel} aria-labelledby="home-activity-title">
			<header className={styles.header}>
				<span className={styles.eyebrow}>
					<Sparkles size={15} aria-hidden="true" />
					{t('homeActivity.eyebrow')}
				</span>
				<h2 id="home-activity-title">{t('homeActivity.title')}</h2>
				<p>{t('homeActivity.subtitle')}</p>
			</header>

			{items.length > 0 ? (
				<div className={styles.list}>
					{items.map((item) => (
						<button
							type="button"
							key={item.id}
							className={styles.item}
							data-kind={item.kind}
							data-unread={item.unread || undefined}
							onClick={() => openItem(item)}
						>
							<span className={styles.itemTop}>
								<span className={styles.kind}>
									<span className={styles.kindIcon}>{iconFor(item.kind)}</span>
									{labelFor(item.kind)}
								</span>
								{item.unread && <span className={styles.unreadDot} aria-label={t('Unread')} />}
							</span>
							<strong>{item.title}</strong>
							{item.context && <span className={styles.context}>{item.context}</span>}
							<span className={styles.meta}>
								<span>
									{[item.author, relativeTime(item.createdAt, currentLanguage)]
										.filter(Boolean)
										.join(' · ')}
								</span>
								<ArrowUpRight size={16} aria-hidden="true" />
							</span>
						</button>
					))}
				</div>
			) : (
				<div className={styles.empty}>
					<span className={styles.emptyIcon} aria-hidden="true">
						<Sparkles size={28} />
					</span>
					<h3>{t('homeActivity.emptyTitle')}</h3>
					<p>{t('homeActivity.emptyBody')}</p>
					<button type="button" className={styles.create} onClick={createActivity}>
						<Plus size={17} aria-hidden="true" />
						{t('homeActivity.create')}
					</button>
				</div>
			)}
		</section>
	);
}
