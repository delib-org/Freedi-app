import { FC, useEffect, useState, useRef, useContext, useCallback, useLayoutEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { StatementContext } from '../../StatementCont';
import styles from './Chat.module.scss';
import ChatMessageCard from './components/chatMessageCard/ChatMessageCard';
import ChatInput from './components/input/ChatInput';
import NewMessages from './components/newMessages/NewMessages';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import Description from '../evaluations/components/description/Description';
import { Statement } from '@freedi/shared-types';
import { hasParagraphsContent } from '@/utils/paragraphUtils';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useNotificationActions } from '@/controllers/hooks/useNotificationActions';
import { fetchOlderSubStatements } from '@/controllers/db/statements/listenToStatements';
import { CHAT } from '@/constants/common';

interface ChatProps {
	sideChat?: boolean;
	numberOfSubStatements?: number;
	showInput?: boolean;
}

const Chat: FC<ChatProps> = ({
	sideChat = false,
	numberOfSubStatements = 0,
	showInput = true,
}) => {
	const chatRef = useRef<HTMLDivElement>(null);
	const { statementId } = useParams();
	const { statement } = useContext(StatementContext);
	const subStatements = useAppSelector(statementSubsSelector(statementId));
	const { user } = useAuthentication();
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
	const location = useLocation();
	const firstTimeRef = useRef(true);

	const [numberOfNewMessages, setNumberOfNewMessages] = useState<number>(0);
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	// Refs for scroll preservation and lazy loading
	const isLoadingMoreRef = useRef(false);
	const prevScrollHeightRef = useRef(0);
	const initialCheckDoneRef = useRef(false);
	// Refs synced with state so the scroll handler always reads current values
	const hasMoreRef = useRef(true);
	const isLoadingRef = useRef(false);
	const oldestCreatedAtRef = useRef<number | null>(null);

	hasMoreRef.current = hasMore;
	isLoadingRef.current = isLoadingMore;

	// Keep track of the oldest message timestamp for the load-more query
	useEffect(() => {
		if (subStatements.length > 0) {
			oldestCreatedAtRef.current = subStatements[0].createdAt;
		}
	}, [subStatements]);

	// Auto-mark notifications as read when viewing chat
	const { markStatementAsRead, getStatementUnreadCount } = useNotificationActions();

	useEffect(() => {
		if (!statementId) return;

		const unreadCount = getStatementUnreadCount(statementId);
		if (unreadCount === 0) return;

		const timer = setTimeout(() => {
			markStatementAsRead(statementId);
		}, 2000);

		return () => clearTimeout(timer);
	}, [statementId, markStatementAsRead, getStatementUnreadCount]);

	// Reset lazy loading state when navigating to a different statement
	useEffect(() => {
		setHasMore(true);
		setIsLoadingMore(false);
		initialCheckDoneRef.current = false;
		oldestCreatedAtRef.current = null;
	}, [statementId]);

	// Check if all messages are already loaded (fewer than initial limit)
	useEffect(() => {
		if (!initialCheckDoneRef.current && subStatements.length > 0) {
			initialCheckDoneRef.current = true;
			if (subStatements.length < CHAT.INITIAL_MESSAGES_LIMIT) {
				setHasMore(false);
			}
		}
	}, [subStatements.length]);

	// Preserve scroll position after loading older messages.
	// NOTE: Do NOT reset isLoadingMoreRef here — the later useEffect that
	// handles new-message scrolling must still see the flag so it can skip.
	useLayoutEffect(() => {
		if (isLoadingMoreRef.current && scrollContainer) {
			const newScrollHeight = scrollContainer.scrollHeight;
			scrollContainer.scrollTop = newScrollHeight - prevScrollHeightRef.current;
		}
	}, [subStatements, scrollContainer]);

	// Fetch older messages — reads from refs so the callback identity is stable
	const loadMore = useCallback(async () => {
		if (!statementId || isLoadingRef.current || !hasMoreRef.current) return;
		if (oldestCreatedAtRef.current === null) return;

		setIsLoadingMore(true);
		isLoadingMoreRef.current = true;
		isLoadingRef.current = true;
		prevScrollHeightRef.current = scrollContainer?.scrollHeight ?? 0;

		const result = await fetchOlderSubStatements(
			statementId,
			oldestCreatedAtRef.current,
			CHAT.LOAD_MORE_BATCH_SIZE,
		);

		setHasMore(result.hasMore);
		setIsLoadingMore(false);
		isLoadingRef.current = false;
	}, [statementId, scrollContainer]);

	// Find the nearest scrollable ancestor once on mount
	useEffect(() => {
		let el = chatRef.current?.parentElement ?? null;
		while (el) {
			const style = window.getComputedStyle(el);
			if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
				setScrollContainer(el);
				break;
			}
			el = el.parentElement;
		}
	}, []);

	// Scroll listener: when user scrolls near the top, load older messages.
	// Delayed setup so the initial scroll-to-bottom completes first.
	useEffect(() => {
		if (!scrollContainer) return;

		let attached = false;

		const onScroll = () => {
			if (scrollContainer.scrollTop < 100) {
				loadMore();
			}
		};

		const timerId = setTimeout(() => {
			scrollContainer.addEventListener('scroll', onScroll, { passive: true });
			attached = true;
		}, 800);

		return () => {
			clearTimeout(timerId);
			if (attached) {
				scrollContainer.removeEventListener('scroll', onScroll);
			}
		};
	}, [scrollContainer, loadMore]);

	function scrollToHash() {
		if (location.hash) {
			const element = document.querySelector(location.hash);

			if (element) {
				element.scrollIntoView();
				firstTimeRef.current = false;

				return;
			}
		}
	}

	const scrollToBottom = () => {
		if (!messagesEndRef) return;
		if (!messagesEndRef.current) return;
		if (location.hash) return;
		if (firstTimeRef.current) {
			messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
			firstTimeRef.current = false;
		} else {
			messagesEndRef.current.scrollIntoView({
				behavior: 'smooth',
				block: 'end',
				inline: 'nearest',
			});
		}
	};

	useEffect(() => {
		firstTimeRef.current = true;
	}, [statementId]);

	useEffect(() => {
		if (!firstTimeRef.current) return;
		if (isLoadingMoreRef.current) return;
		if (subStatements.length === 0) return;

		if (location.hash) {
			scrollToHash();
		} else {
			scrollToBottom();
		}
		firstTimeRef.current = false;
	}, [subStatements]);

	useEffect(() => {
		// Skip scroll logic when loading older messages
		if (isLoadingMoreRef.current) {
			isLoadingMoreRef.current = false;

			return;
		}

		const lastMessage = subStatements[subStatements.length - 1];
		if (lastMessage?.creator?.uid !== user?.uid) {
			const isNewMessages = subStatements.length - numberOfSubStatements > 0;
			numberOfSubStatements = subStatements.length;
			if (isNewMessages) {
				setNumberOfNewMessages((n) => n + 1);
			}
			if (sideChat && isNewMessages) {
				setTimeout(() => scrollToBottom(), 300);
			}
		} else {
			setTimeout(() => scrollToBottom(), 100);
		}
	}, [subStatements.length]);

	return (
		<div className={styles.chatContainer}>
			<div className={`${styles.chat} ${sideChat ? styles.sideChat : ''}`} ref={chatRef}>
				{hasParagraphsContent(statement?.paragraphs) && !sideChat && (
					<div className="wrapper">
						<Description />
					</div>
				)}

				{isLoadingMore && (
					<div className={styles.sentinel}>
						<div className={styles.spinner} />
					</div>
				)}

				{subStatements?.map((statementSub: Statement, index) => (
					<ChatMessageCard
						key={statementSub.statementId}
						parentStatement={statement}
						statement={statementSub}
						previousStatement={subStatements[index - 1]}
						sideChat={sideChat}
					/>
				))}

				<div ref={messagesEndRef} />

				{!sideChat && (
					<NewMessages
						newMessages={numberOfNewMessages}
						setNewMessages={setNumberOfNewMessages}
						scrollToBottom={scrollToBottom}
					/>
				)}
			</div>

			{statement && showInput && (
				<div className={sideChat ? styles.sideChatInputWrapper : styles.input}>
					<ChatInput statement={statement} sideChat={sideChat} />
				</div>
			)}
		</div>
	);
};

export default Chat;
