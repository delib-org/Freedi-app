import { FC } from 'react';
import './StatementChatMore.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions

import { SimpleStatement, Statement } from 'delib-npm';
import { useSelector } from 'react-redux';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { NotificationType } from '@/types/notification/Notification';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
	asButton?: boolean;
}

const StatementChatMore: FC<Props> = ({
	statement,
	onlyCircle,
	useLink = true,
	asButton = true,
}) => {
	const navigate = useNavigate();

	// Redux store

	const creator = useSelector(creatorSelector);

	const inAppNotificationsList: NotificationType[] = useSelector(
		inAppNotificationsSelector
	).filter((n) => n.creatorId !== creator?.uid);

	const handleClick = () => {
		if (useLink) {
			navigate(`/statement/${statement.statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}
	};

	const content = (
		<div className='icon'>
			{inAppNotificationsList.length > 0 && (
				<div className='redCircle'>
					{inAppNotificationsList.length < 10
						? inAppNotificationsList.length
						: `9+`}
				</div>
			)}
			{!onlyCircle && <ChatIcon />}
		</div>
	);

	return asButton ? (
		<button
			className='statementChatMore'
			aria-label='Chat more button'
			onClick={handleClick}
		>
			{content}
		</button>
	) : (
		<div
			className='statementChatMore'
			onClick={handleClick}
			role='button'
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					handleClick();
				}
			}}
			aria-label='Chat more button'
		>
			{content}
		</div>
	);
};

export default StatementChatMore;
