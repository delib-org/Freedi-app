import { FC } from 'react';
import './StatementChatMore.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { SimpleStatement, StatementSubscription, Statement } from 'delib-npm';
import { useSelector } from 'react-redux';
import { inAppNotificationsCountSelectorForStatement } from '@/redux/notificationsSlice/notificationsSlice';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
}

const StatementChatMore: FC<Props> = ({ statement, onlyCircle, useLink = true }) => {
	// Hooks
	const navigate = useNavigate();

	// Redux store
	const countMessages = useSelector(inAppNotificationsCountSelectorForStatement(statement.statementId));

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
