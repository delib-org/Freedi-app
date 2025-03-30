import { FC } from 'react';
import './StatementChatMore.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions

import { SimpleStatement, Statement } from 'delib-npm';
import { useSelector } from 'react-redux';
import { inAppNotificationsCountSelectorForStatement } from '@/redux/notificationsSlice/notificationsSlice';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
}

const StatementChatMore: FC<Props> = ({ statement, onlyCircle, useLink = true }) => {

	const navigate = useNavigate();
	const { user } = useAuthentication();

	// Redux store
	const notifications = useSelector(inAppNotificationsCountSelectorForStatement(statement.statementId))

	const countMessages = notifications.filter(notification => notification.creatorName !== user.displayName).length;

	return (
		<button
			className='statementChatMore'
			aria-label='Chat more button'
			onClick={() => {
				if (useLink)
					navigate(`/statement/${statement.statementId}/chat`, {
						state: { from: window.location.pathname },
					})
			}}
		>
			<div className='icon'>
				{countMessages > 0 && (
					<div className='redCircle'>
						{countMessages < 10
							? countMessages
							: `9+`}
					</div>
				)}
				{!onlyCircle && < ChatIcon />}
			</div>
		</button>
	);
};

export default StatementChatMore;
