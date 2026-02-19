import { FC, useEffect, useState, useRef, useContext } from 'react';
import { useLocation, useParams } from 'react-router';
import { StatementContext } from '../../StatementCont';
import styles from './Chat.module.scss';
import ChatMessageCard from './components/chatMessageCard/ChatMessageCard';
import ChatInput from './components/input/ChatInput';
import NewMessages from './components/newMessages/NewMessages';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { useAppSelector, useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import Description from '../evaluations/components/description/Description';
import { Statement } from '@freedi/shared-types';
import { hasParagraphsContent } from '@/utils/paragraphUtils';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useNotificationActions } from '@/controllers/hooks/useNotificationActions';

interface ChatProps {
	sideChat?: boolean;
	firstTime?: boolean;
	numberOfSubStatements?: number;
	showInput?: boolean;
}

const Chat: FC<ChatProps> = ({
	sideChat = false,
	firstTime = true,
	numberOfSubStatements = 0,
	showInput = true,
}) => {
	const chatRef = useRef<HTMLDivElement>(null);
	const { statementId } = useParams();
	const { statement } = useContext(StatementContext);
	const subStatements = useAppSelector(statementSubsSelector(statementId));
	const { user } = useAuthentication();
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const location = useLocation();

	const [numberOfNewMessages, setNumberOfNewMessages] = useState<number>(0);

	// ✅ Auto-mark notifications as read when viewing chat
	const { markStatementAsRead, getStatementUnreadCount } = useNotificationActions();

	// Mark notifications as read after viewing for 2 seconds
	useEffect(() => {
		if (!statementId) return;

		const unreadCount = getStatementUnreadCount(statementId);
		if (unreadCount === 0) return;

		// Mark as read after 2 seconds of viewing the chat
		const timer = setTimeout(() => {
			markStatementAsRead(statementId);
		}, 2000);

		return () => clearTimeout(timer);
	}, [statementId, markStatementAsRead, getStatementUnreadCount]);

	function scrollToHash() {
		if (location.hash) {
			const element = document.querySelector(location.hash);

			if (element) {
				element.scrollIntoView();
				firstTime = false;

				return;
			}
		}
	}

	//scroll to bottom with smooth animation
	const scrollToBottom = () => {
		if (!messagesEndRef) return;
		if (!messagesEndRef.current) return;
		if (location.hash) return;
		if (firstTime) {
			messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
			firstTime = false;
		} else {
			// Enhanced smooth scrolling with better animation
			messagesEndRef.current.scrollIntoView({
				behavior: 'smooth',
				block: 'end',
				inline: 'nearest',
			});
		}
	};

	useEffect(() => {
		firstTime = true;

		const unsubscribe = listenToSubStatements(statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	//effects
	useEffect(() => {
		if (!firstTime) return;

		if (location.hash) {
			scrollToHash();
		} else {
			scrollToBottom();
		}
		firstTime = false;
	}, [subStatements]);

	useEffect(() => {
		//if new sub-statement was not created by the user, then set numberOfNewMessages to the number of new subStatements
		const lastMessage = subStatements[subStatements.length - 1];
		if (lastMessage?.creator?.uid !== user?.uid) {
			const isNewMessages = subStatements.length - numberOfSubStatements > 0;
			numberOfSubStatements = subStatements.length;
			if (isNewMessages) {
				setNumberOfNewMessages((n) => n + 1);
			}
			// For sideChat, auto-scroll to new messages
			if (sideChat && isNewMessages) {
				setTimeout(() => scrollToBottom(), 300);
			}
		} else {
			// User's own message, scroll immediately
			setTimeout(() => scrollToBottom(), 100);
		}
	}, [subStatements.length]);

	return (
		<div className={`${styles.chat} ${sideChat ? styles.sideChat : ''}`} ref={chatRef}>
			{hasParagraphsContent(statement?.paragraphs) && !sideChat && (
				<div className="wrapper">
					<Description />
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

			{statement && showInput && (
				<div className={sideChat ? styles.sideChatInputWrapper : styles.input}>
					<ChatInput statement={statement} sideChat={sideChat} />
				</div>
			)}
			{!sideChat && (
				<div>
					<NewMessages
						newMessages={numberOfNewMessages}
						setNewMessages={setNumberOfNewMessages}
						scrollToBottom={scrollToBottom}
					/>
				</div>
			)}
		</div>
	);
};

export default Chat;
