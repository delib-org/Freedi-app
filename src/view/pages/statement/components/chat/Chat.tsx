import { FC, useEffect, useState, useRef, useContext, useCallback } from 'react';
import { useLocation, useParams } from 'react-router';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { StatementContext } from '../../StatementCont';
import styles from './Chat.module.scss';
import ChatMessageCard from './components/chatMessageCard/ChatMessageCard';
import ChatInput from './components/input/ChatInput';
import NewMessages from './components/newMessages/NewMessages';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import Description from '../evaluations/components/description/Description';
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

const Chat: FC<ChatProps> = ({ sideChat = false, numberOfSubStatements = 0, showInput = true }) => {
	const virtuosoRef = useRef<VirtuosoHandle>(null);
	const { statementId } = useParams();
	const { statement } = useContext(StatementContext);
	const subStatements = useAppSelector(statementSubsSelector(statementId));
	const { user } = useAuthentication();
	const location = useLocation();
	const firstTimeRef = useRef(true);

	const [numberOfNewMessages, setNumberOfNewMessages] = useState<number>(0);
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	// Refs for lazy loading
	const isLoadingMoreRef = useRef(false);
	const initialCheckDoneRef = useRef(false);
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
		firstTimeRef.current = true;
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

	// Fetch older messages when user scrolls to top — called by Virtuoso's startReached
	const loadMore = useCallback(async () => {
		if (!statementId || isLoadingRef.current || !hasMoreRef.current) return;
		if (oldestCreatedAtRef.current === null) return;

		setIsLoadingMore(true);
		isLoadingMoreRef.current = true;
		isLoadingRef.current = true;

		const result = await fetchOlderSubStatements(
			statementId,
			oldestCreatedAtRef.current,
			CHAT.LOAD_MORE_BATCH_SIZE,
		);

		setHasMore(result.hasMore);
		setIsLoadingMore(false);
		isLoadingRef.current = false;
		isLoadingMoreRef.current = false;
	}, [statementId]);

	const scrollToBottom = useCallback(() => {
		if (location.hash) return;
		virtuosoRef.current?.scrollToIndex({
			index: 'LAST',
			behavior: firstTimeRef.current ? 'auto' : 'smooth',
		});
		firstTimeRef.current = false;
	}, [location.hash]);

	// Handle hash navigation
	useEffect(() => {
		if (!location.hash || subStatements.length === 0) return;

		const targetId = location.hash.slice(1);
		const index = subStatements.findIndex((s) => s.statementId === targetId);
		if (index >= 0) {
			virtuosoRef.current?.scrollToIndex({ index, behavior: 'auto', align: 'center' });
			firstTimeRef.current = false;
		}
	}, [subStatements, location.hash]);

	// Initial scroll to bottom
	useEffect(() => {
		if (!firstTimeRef.current) return;
		if (isLoadingMoreRef.current) return;
		if (subStatements.length === 0) return;

		if (!location.hash) {
			scrollToBottom();
		}
		firstTimeRef.current = false;
	}, [subStatements, location.hash, scrollToBottom]);

	// Handle new messages from other users
	useEffect(() => {
		if (isLoadingMoreRef.current) return;

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

	// Render each chat message card — used by Virtuoso
	const renderItem = useCallback(
		(index: number) => {
			const statementSub = subStatements[index];

			return (
				<ChatMessageCard
					parentStatement={statement}
					statement={statementSub}
					previousStatement={subStatements[index - 1]}
					sideChat={sideChat}
				/>
			);
		},
		[subStatements, statement, sideChat],
	);

	// Header component for description and loading indicator
	const Header = useCallback(
		() => (
			<>
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
			</>
		),
		[statement?.paragraphs, sideChat, isLoadingMore],
	);

	return (
		<div className={styles.chatContainer}>
			<div className={`${styles.chat} ${sideChat ? styles.sideChat : ''}`}>
				<Virtuoso
					ref={virtuosoRef}
					totalCount={subStatements.length}
					itemContent={renderItem}
					startReached={loadMore}
					followOutput="smooth"
					initialTopMostItemIndex={subStatements.length > 0 ? subStatements.length - 1 : 0}
					components={{ Header }}
					style={{ height: '100%' }}
					increaseViewportBy={200}
				/>

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
