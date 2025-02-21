import { FC } from 'react';
import './StatementChatMore.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { Statement } from '@/types/statement/Statement';
import { StatementSubscription } from '@/types/statement/StatementSubscription';

interface Props {
	statement: Statement;
}

const StatementChatMore: FC<Props> = ({ statement }) => {
	// Hooks
	const navigate = useNavigate();

	// Redux store
	const statementSubscription: StatementSubscription | undefined =
		useAppSelector(statementSubscriptionSelector(statement.statementId));

	// Variables
	const messagesRead = statementSubscription?.totalSubStatementsRead || 0;
	const messages = statement.totalSubStatements || 0;

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
