import { FC } from 'react';
import styles from './chat-message-notify.module.scss';

interface Props {
	count: number;
}

const ChatMessageNotify: FC<Props> = ({ count }) => {
	return <div className={styles.chatMessageNotify}>{count > 0 ? count : ''}</div>;
};

export default ChatMessageNotify;
