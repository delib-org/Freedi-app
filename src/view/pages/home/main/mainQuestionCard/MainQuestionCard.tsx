import { FC, useEffect } from 'react';
import { Link } from 'react-router';
import styles from './MainQuestionCard.module.scss';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import { statementSelector } from '@/redux/statements/statementsSlice';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, Statement } from 'delib-npm';
import { useSelector } from 'react-redux';
import { getTime } from '@/controllers/general/helpers';

interface Props {
	simpleStatement: SimpleStatement;
}

const MainQuestionCard: FC<Props> = ({ simpleStatement }) => {

	const statement: Statement | undefined = useSelector(statementSelector(simpleStatement.statementId))
	const lastMessage = statement?.lastMessage;

	useEffect(() => {
		const unsubscribe = listenToStatement(simpleStatement.statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	return (
		<Link
			className={styles.mainCard}
			to={`/statement/${simpleStatement.statementId}/`}
		>			<div className={styles.info}>
				<div className={styles.title}>
					<div>{simpleStatement.statement}</div>
					<div onClick={(e) => e.stopPropagation()}>
						<StatementChatMore statement={simpleStatement} />
					</div>
				</div>

				{lastMessage && <div className={styles.updates}>
					{lastMessage?.creator}: {lastMessage?.message}, {getTime(lastMessage?.createdAt)}
				</div>}
			</div>

		</Link>
	);
};

export default MainQuestionCard;
