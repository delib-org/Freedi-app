import { FC, memo, useMemo, useState, MouseEvent, KeyboardEvent, TouchEvent } from 'react';
import clsx from 'clsx';
import styles from './StatementChatMore.module.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Types and Redux
import { SimpleStatement, Statement } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import { createSelector } from '@reduxjs/toolkit';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementsSelector } from '@/redux/statements/statementsSlice';
import { createPredicateCountSelector } from '@/redux/utils/selectorFactories';
import UnreadBadge from '@/view/components/unreadBadge/UnreadBadge';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { AnswerChatSheet } from '@/view/components/atomic/molecules/AnswerChatSheet';

export type StatementChatMoreVariant = 'bubble' | 'pill';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
	asButton?: boolean;
	/** Show message count even when there are no unread notifications */
	showMessageCount?: boolean;
	/** 'bubble' (default) = the icon bubble; 'pill' = the answer card's שיחה pill. */
	variant?: StatementChatMoreVariant;
	/** Open the thread in a bottom sheet instead of navigating to the chat page.
	 *  Off by default so every other call site keeps navigating. */
	opensSheet?: boolean;
}

/**
 * StatementChatMore - Enhanced chat bubble for option cards
 *
 * Displays a prominent chat icon with:
 * - Total message count (always visible when messages exist)
 * - Unread notification badge (overlaid when there are unread messages)
 *
 * UX improvements:
 * - Larger touch target (44px minimum) for accessibility
 * - Visual container with border for better visibility
 * - Color-coded states (empty, has messages, has unread)
 * - Hover/active states for interactivity feedback
 */
const StatementChatMore: FC<Props> = ({
	statement,
	onlyCircle,
	useLink = true,
	asButton = true,
	showMessageCount = true,
	variant = 'bubble',
	opensSheet = false,
}) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const [isSheetOpen, setIsSheetOpen] = useState(false);

	// Redux store
	const creator = useSelector(creatorSelector);

	// Per-instance memoized COUNT selectors returning primitives, so this
	// component (rendered once per card) does not re-render on unrelated
	// store dispatches. Creating a list selector inline on every render
	// defeated memoization and re-rendered every card on every dispatch.
	const selectSubCount = useMemo(
		() =>
			createPredicateCountSelector(statementsSelector)((s) => s.parentId === statement.statementId),
		[statement.statementId],
	);
	const subStatementsCount = useSelector(selectSubCount);

	// Get total sub-statements count - prioritize Redux store count, fallback to statement field
	const totalMessages = useMemo(() => {
		// Use Redux store count if available (more accurate)
		if (subStatementsCount > 0) {
			return subStatementsCount;
		}

		// Fallback to totalSubStatements field from the statement
		if ('totalSubStatements' in statement && typeof statement.totalSubStatements === 'number') {
			return statement.totalSubStatements;
		}

		return 0;
	}, [subStatementsCount, statement]);

	// Count UNREAD notifications only (missing `read` field counts as unread
	// for backward compatibility)
	const selectUnreadCount = useMemo(
		() =>
			createSelector(
				[inAppNotificationsSelector],
				(notifications) =>
					notifications.filter(
						(n) =>
							n.creatorId !== creator?.uid &&
							n.parentId === statement.statementId &&
							(!n.read || n.read === undefined),
					).length,
			),
		[creator?.uid, statement.statementId],
	);
	const unreadCount = useSelector(selectUnreadCount);
	// Consider has messages if either we have total count or unread notifications
	const hasMessages = totalMessages > 0 || unreadCount > 0;
	const hasUnread = unreadCount > 0;
	// Display count: show total if available, otherwise show unread as indicator
	const displayCount = totalMessages > 0 ? totalMessages : unreadCount > 0 ? unreadCount : 0;

	const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
		// Prevent accidental navigation when selecting text nearby
		e.stopPropagation();
		e.preventDefault();

		if (opensSheet) {
			setIsSheetOpen(true);

			return;
		}

		if (!useLink) {
			return;
		}

		// Verify click is from this button - extra safety check
		// to prevent accidental navigation from parent elements
		const button = e.currentTarget;
		if (!button) {
			return;
		}

		// The active tab is driven by the `tab` search param, not the path
		// segment. Without it the screen falls back to `defaultView`, so a
		// question whose default view is Solutions would swallow this click.
		navigate(`/statement/${statement.statementId}/chat?tab=chat`, {
			state: { from: window.location.pathname },
		});
	};

	// Build accessible label
	const ariaLabel = useMemo(() => {
		const parts: string[] = [];

		if (displayCount > 0) {
			parts.push(`${displayCount} ${displayCount === 1 ? t('message') : t('messages')}`);
		} else {
			parts.push(t('No messages'));
		}

		if (hasUnread) {
			parts.push(`${unreadCount} ${t('unread')}`);
		}

		parts.push(t('Click to open discussion'));

		return parts.join('. ');
	}, [displayCount, hasUnread, unreadCount, t]);

	const isPill = variant === 'pill';

	// Determine container class based on state
	const containerClass = useMemo(() => {
		const classes = [styles.chatContainer];

		if (hasMessages) {
			classes.push(styles['chatContainer--hasMessages']);
		} else {
			classes.push(styles['chatContainer--empty']);
		}

		return classes.join(' ');
	}, [hasMessages]);

	const bubbleContent = (
		<div className={containerClass}>
			<div className={styles.icon}>
				{/* Unread badge - positioned absolutely over the icon */}
				{hasUnread && (
					<UnreadBadge
						count={unreadCount}
						position="absolute"
						size="small"
						ariaLabel={`${unreadCount} ${t('unread')} ${unreadCount === 1 ? t('response') : t('responses')}`}
					/>
				)}
				{!onlyCircle && <ChatIcon />}
			</div>

			{/* Message count - always visible when showMessageCount is true and there are messages */}
			{showMessageCount && displayCount > 0 && (
				<span className={styles.messageCount} aria-hidden="true">
					{displayCount}
				</span>
			)}
		</div>
	);

	// The answer card's שיחה pill: glyph, word, count, red unread badge. With
	// unread messages the whole pill turns yellow so it reads from across the list.
	const pillContent = (
		<span
			className={clsx(styles.pill, hasUnread && styles['pill--unread'])}
			data-unread={hasUnread ? 'true' : 'false'}
			data-testid="statement-chat-more-pill"
		>
			<svg
				className={styles.pillIcon}
				width="15"
				height="15"
				viewBox="0 0 20 20"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M17 11.5a2.5 2.5 0 0 1-2.5 2.5H7l-4 3V5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6z"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<span aria-hidden="true">{t('Conversation')}</span>
			{showMessageCount && displayCount > 0 && (
				<span className={styles.pillCount} aria-hidden="true">
					{displayCount}
				</span>
			)}
			{hasUnread && (
				<span
					className={styles.pillUnread}
					aria-hidden="true"
					data-testid="statement-chat-more-unread"
				>
					{unreadCount}
				</span>
			)}
		</span>
	);

	const content = isPill ? pillContent : bubbleContent;

	const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		// Only allow Enter and Space to trigger navigation
		if (e.key !== 'Enter' && e.key !== ' ') {
			return;
		}
		// Let the button handle it naturally - this will trigger onClick
	};

	const handleTouchEnd = (e: TouchEvent<HTMLButtonElement>) => {
		e.stopPropagation();
	};

	const buttonClass = clsx(styles.statementChatMore, isPill && styles['statementChatMore--pill']);

	const sheet = opensSheet && (
		<AnswerChatSheet
			isOpen={isSheetOpen}
			onClose={() => setIsSheetOpen(false)}
			answerId={statement.statementId}
			answerText={statement.statement}
		/>
	);

	return (
		<>
			{asButton ? (
				<button
					className={buttonClass}
					aria-label={ariaLabel}
					aria-haspopup={opensSheet ? 'dialog' : undefined}
					onClick={handleClick}
					onTouchEnd={handleTouchEnd}
					onKeyDown={handleKeyDown}
					type="button"
					data-testid="statement-chat-more-button"
				>
					{content}
				</button>
			) : (
				<button
					type="button"
					className={buttonClass}
					onClick={handleClick}
					onTouchEnd={handleTouchEnd}
					onKeyDown={handleKeyDown}
					aria-label={ariaLabel}
					aria-haspopup={opensSheet ? 'dialog' : undefined}
					data-testid="statement-chat-more-button"
				>
					{content}
				</button>
			)}
			{sheet}
		</>
	);
};

export default memo(StatementChatMore);
