import { FC, useEffect, useState, useRef, useContext, useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { StatementContext } from '../../StatementCont';
import styles from './Chat.module.scss';
import TreeOptionNode from '../treeView/components/TreeOptionNode/TreeOptionNode';
import TreeMessageNode from '../treeView/components/TreeMessageNode/TreeMessageNode';
import ChatInput from './components/input/ChatInput';
import NewMessages from './components/newMessages/NewMessages';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import Description from '../evaluations/components/description/Description';
import { Statement, StatementType } from '@freedi/shared-types';
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
	// Memoize per statementId — calling the selector factory inline creates a
	// new selector (and a new array) on every render/dispatch.
	const selectSubs = useMemo(() => statementSubsSelector(statementId), [statementId]);
	const subStatements = useAppSelector(selectSubs);
	const { user } = useAuthentication();
	const location = useLocation();
	const firstTimeRef = useRef(true);

	// Full-page scroll: in the main view the page (`.page__main`) is the single
	// scroller — Virtuoso attaches to it via customScrollParent so the
	// description, paragraphs, and messages all scroll together. The side-chat
	// panel keeps its own internal scroller.
	const [pageScroller, setPageScroller] = useState<HTMLElement | null>(null);
	const containerRefCallback = useCallback(
		(node: HTMLDivElement | null) => {
			if (node && !sideChat) {
				setPageScroller(node.closest('.page__main') as HTMLElement | null);
			}
		},
		[sideChat],
	);
	const usePageScroll = !sideChat && pageScroller !== null;

	const [numberOfNewMessages, setNumberOfNewMessages] = useState<number>(0);
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [replyToStatement, setReplyToStatement] = useState<Statement | null>(null);

	// Refs for lazy loading
	const isLoadingMoreRef = useRef(false);
	const initialCheckDoneRef = useRef(false);
	const hasMoreRef = useRef(true);
	const isLoadingRef = useRef(false);
	const oldestCreatedAtRef = useRef<number | null>(null);
	// Gates loadMore. Virtuoso fires a false-positive `startReached` during the
	// initial mount/scroll-to-bottom (it's pinned to the last item via
	// initialTopMostItemIndex), which would eagerly pull the whole history at
	// once. We "arm" loadMore shortly after the initial load so that early
	// false-positive is ignored; genuine scroll-to-top afterwards paginates
	// normally. Worst case (very slow load) it degrades to the prior behavior.
	const loadMoreArmedRef = useRef(false);

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

	// Reset lazy loading state when navigating to a different statement, and arm
	// loadMore only after the initial render/scroll has settled (see ref comment).
	useEffect(() => {
		setHasMore(true);
		setIsLoadingMore(false);
		initialCheckDoneRef.current = false;
		oldestCreatedAtRef.current = null;
		firstTimeRef.current = true;
		loadMoreArmedRef.current = false;
		const armTimer = setTimeout(() => {
			loadMoreArmedRef.current = true;
		}, 1200);

		return () => clearTimeout(armTimer);
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
		if (!loadMoreArmedRef.current) return;
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
		const behavior = firstTimeRef.current ? 'auto' : 'smooth';
		if (usePageScroll && pageScroller) {
			// Scroll the page to its true end (past the footer spacer), so the
			// last message sits fully above the sticky input.
			pageScroller.scrollTo({ top: pageScroller.scrollHeight, behavior });
		} else {
			virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior });
		}
		firstTimeRef.current = false;
	}, [location.hash, usePageScroll, pageScroller]);

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

	// Initial scroll to bottom. In page-scroll mode the list height settles
	// over a few frames after mount (Virtuoso measures items against the
	// page scroller), so re-pin to the true end a few times until stable —
	// a single scroll lands short and the sticky input covers the last
	// message.
	useEffect(() => {
		if (!firstTimeRef.current) return;
		if (isLoadingMoreRef.current) return;
		if (subStatements.length === 0) return;
		if (location.hash) {
			firstTimeRef.current = false;

			return;
		}

		firstTimeRef.current = false;

		if (!usePageScroll || !pageScroller) {
			scrollToBottom();

			return;
		}

		const pinToEnd = () =>
			pageScroller.scrollTo({ top: pageScroller.scrollHeight, behavior: 'auto' });
		pinToEnd();
		const timers = [50, 150, 350, 700].map((ms) => setTimeout(pinToEnd, ms));

		return () => timers.forEach(clearTimeout);
	}, [subStatements, location.hash, scrollToBottom, usePageScroll, pageScroller]);

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

	const handleClearReply = useCallback(() => {
		setReplyToStatement(null);
	}, []);

	// Render each statement using the tree card components (shared with the tree view) — used by Virtuoso.
	// The wrapper establishes a new block formatting context (flow-root) so the
	// nodes' own margins are included in Virtuoso's item measurement — escaped
	// margins made the list taller than Virtuoso's estimate and the overflow
	// slid under the sticky input.
	const renderItem = useCallback(
		(index: number) => {
			const statementSub = subStatements[index];
			const isOption = statementSub.statementType === StatementType.option;

			return (
				<div className={styles.messageWrapper}>
					{isOption ? (
						<TreeOptionNode
							statement={statementSub}
							parentStatement={statement}
							onReply={setReplyToStatement}
						/>
					) : (
						<TreeMessageNode
							statement={statementSub}
							parentStatement={statement}
							hasChildren={false}
							onReply={setReplyToStatement}
						/>
					)}
				</div>
			);
		},
		[subStatements, statement],
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
		<div
			ref={containerRefCallback}
			className={`${styles.chatContainer} ${usePageScroll ? styles.chatContainerPage : ''}`}
		>
			<div
				className={`${styles.chat} ${sideChat ? styles.sideChat : ''} ${usePageScroll ? styles.chatPage : ''}`}
			>
				{(sideChat || usePageScroll) && (
					<Virtuoso
						// Remount when messages first arrive so initialTopMostItemIndex
						// (pin to newest) is applied against a measured list — mounting
						// with an empty list left the page scrolled to the top.
						key={`chat-${statementId ?? ''}-${subStatements.length > 0 ? 'ready' : 'empty'}`}
						ref={virtuosoRef}
						totalCount={subStatements.length}
						itemContent={renderItem}
						startReached={loadMore}
						followOutput="smooth"
						initialTopMostItemIndex={subStatements.length > 0 ? subStatements.length - 1 : 0}
						components={{ Header }}
						customScrollParent={usePageScroll ? (pageScroller ?? undefined) : undefined}
						style={sideChat ? { height: '100%' } : undefined}
						increaseViewportBy={200}
					/>
				)}

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
					<ChatInput
						statement={statement}
						sideChat={sideChat}
						replyToStatement={replyToStatement}
						onClearReply={handleClearReply}
					/>
				</div>
			)}
		</div>
	);
};

export default Chat;
