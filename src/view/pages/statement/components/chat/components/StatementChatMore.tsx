import { FC } from 'react';
import './StatementChatMore.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { SimpleStatement, StatementSubscription, Statement } from 'delib-npm';

interface Props {
	statement: Statement | SimpleStatement;
}

const StatementChatMore: FC<Props> = ({ statement }) => {
	// Hooks
	const navigate = useNavigate();

	// Redux store
	const statementSubscription: StatementSubscription | undefined =
		useAppSelector(statementSubscriptionSelector(statement.statementId));

	// Variables
	const messagesRead = statementSubscription?.totalSubStatementsRead || 0;
	const messages = 'totalSubStatements' in statement ? statement.totalSubStatements : 0;

	return (
		<button
			className='statementChatMore'
			aria-label='Chat more button'
			onClick={() =>
				navigate(`/statement/${statement.statementId}/chat`, {
					state: { from: window.location.pathname },
				})
			}
		>
			<div className='icon'>
				{messages}
				{messages - messagesRead > 0 && (
					<div className='redCircle'>
						{messages - messagesRead < 10
							? messages - messagesRead
							: `9+`}
					</div>
				)}
				<ChatIcon />
			</div>
		</button>
	);
};

export default StatementChatMore;
