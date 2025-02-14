import { FC, useEffect, useState, useRef, useContext } from 'react';

// Third Party Imports

// Custom Components
import { useLocation, useParams } from 'react-router';
import useSlideAndSubStatement from '../../../../../controllers/hooks/useSlideAndSubStatement';
import { StatementContext } from '../../StatementCont';
import styles from './Chat.module.scss';
import ChatMessageCard from './components/chatMessageCard/ChatMessageCard';
import ChatInput from './components/input/ChatInput';

import NewMessages from './components/newMessages/NewMessages';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import Description from '../evaluations/components/description/Description';
import { StatementType } from '@/types/TypeEnums';
import { Statement } from '@/types/statement/Statement';

let firstTime = true;
let numberOfSubStatements = 0;

const Chat: FC = () => {
	const chatRef = useRef<HTMLDivElement>(null);
	const { statementId } = useParams();
	const { statement } = useContext(StatementContext);
	const subStatements = useAppSelector(
		statementSubsSelector(statementId)
	).filter((s) => s.statementType !== StatementType.stage);
	const user = useAppSelector(userSelector);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const location = useLocation();

	const [numberOfNewMessages, setNumberOfNewMessages] = useState<number>(0);

	const { toSlide, slideInOrOut } = useSlideAndSubStatement(
		statement?.parentId
	);

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

	useEffect(() => {
		const updateChatHeight = () => {
			if (chatRef.current) {
				chatRef.current.style.height = `${window.innerHeight - chatRef.current.getBoundingClientRect().top}px`;
			}
		};

		updateChatHeight();
		window.addEventListener('resize', updateChatHeight);

		return () => {
			window.removeEventListener('resize', updateChatHeight);
		};
	}, []);

	//scroll to bottom
	const scrollToBottom = () => {
		if (!messagesEndRef) return;
		if (!messagesEndRef.current) return;
		if (location.hash) return;
		if (firstTime) {
			messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
			firstTime = false;
		} else {
			messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
		if (lastMessage?.creatorId !== user?.uid) {
			const isNewMessages =
				subStatements.length - numberOfSubStatements > 0;
			numberOfSubStatements = subStatements.length;
			if (isNewMessages) {
				setNumberOfNewMessages((n) => n + 1);
			}
		} else {
			scrollToBottom();
		}
	}, [subStatements.length]);

	return (
		<div className={styles.chat} ref={chatRef}>
			<div
				className={`${styles.wrapper} ${toSlide && slideInOrOut}`}
				id={`msg-${statement?.statementId}`}
			>
				<div className='wrapper'>
					<Description />
				</div>
				{subStatements?.map((statementSub: Statement, index) => (
					<div key={statementSub.statementId}>
						<ChatMessageCard
							parentStatement={statement}
							statement={statementSub}
							previousStatement={subStatements[index - 1]}
						/>
					</div>
				))}

				<div ref={messagesEndRef} />
			</div>
			{statement && (
				<div className={styles.input}>
					<ChatInput statement={statement} />
				</div>
			)}
			<div>
				<NewMessages
					newMessages={numberOfNewMessages}
					setNewMessages={setNumberOfNewMessages}
					scrollToBottom={scrollToBottom}
				/>
			</div>
		</div>
	);
};

export default Chat;
