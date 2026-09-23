import React from 'react';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getCreatorDisplayName } from '@/helpers/getCreatorDisplayName';
import { getInitials, getTime } from '@/controllers/general/helpers';
import styles from './AnswerChatSheet.module.scss';

const AVATAR_TONES = ['lilac', 'mint', 'yellow', 'sunken'] as const;

/** Stable tone per author, so one person keeps one avatar colour in a thread. */
export function avatarToneFor(uid: string | undefined): (typeof AVATAR_TONES)[number] {
	if (!uid) return 'sunken';
	let hash = 0;
	for (let i = 0; i < uid.length; i++) hash = (hash + uid.charCodeAt(i)) % AVATAR_TONES.length;

	return AVATAR_TONES[hash];
}

interface AnswerChatMessageProps {
	message: Statement;
	isNew: boolean;
}

const AnswerChatMessage: React.FC<AnswerChatMessageProps> = ({ message, isNew }) => {
	const { t } = useTranslation();
	const name = getCreatorDisplayName(message);
	const photoURL = message.creator?.photoURL;
	const description = (message.description ?? '').trim();

	return (
		// data-contribution-id is what useReadVisibleNotifications observes.
		<div className={styles.message} data-contribution-id={message.statementId}>
			<span
				className={clsx(
					styles.avatar,
					styles[`avatar--${avatarToneFor(message.creator?.uid ?? message.creatorId)}`],
				)}
				aria-hidden="true"
			>
				{photoURL ? <img src={photoURL} alt="" /> : getInitials(name).slice(0, 2)}
			</span>
			<div className={styles.messageBody}>
				<div className={styles.messageMeta}>
					{name && <span>{name} · </span>}
					<time dateTime={new Date(message.createdAt).toISOString()}>
						{getTime(message.createdAt)}
					</time>
					{isNew && <span className={styles.messageNew}> · {t('New')}</span>}
				</div>
				<div className={styles.bubble}>
					<p className={styles.bubbleText} dir="auto">
						{message.statement}
					</p>
					{description && description !== message.statement && (
						<p className={styles.bubbleDescription}>{description}</p>
					)}
				</div>
			</div>
		</div>
	);
};

export default AnswerChatMessage;
