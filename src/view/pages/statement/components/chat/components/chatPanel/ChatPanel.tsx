import { useParams } from 'react-router';
import styles from './ChatPanel.module.scss';
import Chat from '../../Chat';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

const ChatPanel = () => {
	const { screen } = useParams();

	if (
		screen === 'mind-map' ||
		screen === 'polarization-index' ||
		screen === 'agreement-map'
	)
		return null;

	return (
		<div className={styles.chatPanelContainer}>
			<div className={styles.sideChatTitle}>
				<ChatIcon></ChatIcon> <h5>Free Discussion</h5>
			</div>
			<p>
				Questions and topics that emerged from the main discussion
				thread
			</p>
			<Chat sideChat={true} />
		</div>
	);
};

export default ChatPanel;
