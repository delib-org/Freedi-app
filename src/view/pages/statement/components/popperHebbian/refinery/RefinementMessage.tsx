import { FC } from 'react';
import Markdown from '@/view/components/markdown/Markdown';
import styles from './RefinementMessage.module.scss';

interface RefinementMessageProps {
	role: 'ai' | 'user';
	content: string;
	timestamp: number;
}

const RefinementMessage: FC<RefinementMessageProps> = ({ role, content, timestamp }) => {
	const formatTime = (timestamp: number): string => {
		const date = new Date(timestamp);
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');

		return `${hours}:${minutes}`;
	};

	return (
		<div className={`${styles.message} ${styles[`message--${role}`]}`}>
			<div className={styles.messageHeader}>
				<span className={styles.messageRole}>{role === 'ai' ? '🤖 AI Guide' : '👤 You'}</span>
				<span className={styles.messageTime}>{formatTime(timestamp)}</span>
			</div>
			<div className={styles.messageContent}>
				{role === 'ai' ? <Markdown>{content}</Markdown> : <p>{content}</p>}
			</div>
		</div>
	);
};

export default RefinementMessage;
