import { FC, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import styles from './MainQuestionCard.module.scss';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import {
	statementSelector,
	statementSelectorById,
	setStatement,
} from '@/redux/statements/statementsSlice';
import StatementChatMore from '@/view/pages/statement/components/chat/components/statementChatMore/StatementChatMore';
import { SimpleStatement, Statement } from '@freedi/shared-types';
import { getTime } from '@/controllers/general/helpers';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { logError } from '@/utils/errorHandling';

interface Props {
	simpleStatement: SimpleStatement;
}

const MainQuestionCard: FC<Props> = ({ simpleStatement }) => {
	const dispatch = useDispatch();
	const statement: Statement | undefined = useSelector(
		statementSelector(simpleStatement.statementId),
	);
	const lastMessage = statement?.lastMessage;

	const parentStatement = useSelector(statementSelectorById(statement?.parentId));
	const topParentStatement = useSelector(statementSelectorById(statement?.topParentId));

	useEffect(() => {
		const unsubscribe = listenToStatement(simpleStatement.statementId);

		return () => {
			unsubscribe();
		};
	}, []);

	// Fetch parent statements for breadcrumb if not in Redux
	useEffect(() => {
		if (statement?.parentId && !parentStatement) {
			getStatementFromDB(statement.parentId)
				.then((st) => {
					if (st) dispatch(setStatement(st));
				})
				.catch((error) => {
					logError(error, {
						operation: 'MainQuestionCard.fetchParent',
						statementId: statement.parentId,
					});
				});
		}
	}, [statement?.parentId, parentStatement]);

	useEffect(() => {
		if (
			statement?.topParentId &&
			statement.topParentId !== statement.parentId &&
			!topParentStatement
		) {
			getStatementFromDB(statement.topParentId)
				.then((st) => {
					if (st) dispatch(setStatement(st));
				})
				.catch((error) => {
					logError(error, {
						operation: 'MainQuestionCard.fetchTopParent',
						statementId: statement.topParentId,
					});
				});
		}
	}, [statement?.topParentId, statement?.parentId, topParentStatement]);

	const breadcrumb = useMemo(() => {
		const parts: string[] = [];

		if (topParentStatement && statement?.topParentId !== statement?.parentId) {
			parts.push(getFirstLine(topParentStatement.statement));
		}

		if (parentStatement) {
			parts.push(getFirstLine(parentStatement.statement));
		}

		return parts.join(' › ');
	}, [parentStatement, topParentStatement, statement?.topParentId, statement?.parentId]);

	return (
		<Link
			className={styles.chatItem}
			to={`/statement/${simpleStatement.statementId}/`}
			state={{ from: window.location.pathname }}
		>
			{breadcrumb && <div className={styles.breadcrumb}>{breadcrumb}</div>}
			<div className={styles.header}>
				<div className={styles.title}>{simpleStatement.statement}</div>
				<div className={styles.meta}>
					{lastMessage?.createdAt && (
						<span className={styles.time}>{getTime(lastMessage.createdAt)}</span>
					)}
					<div onClick={(e) => e.stopPropagation()}>
						<StatementChatMore statement={simpleStatement} />
					</div>
				</div>
			</div>
			{lastMessage?.creator && lastMessage?.message && (
				<div className={styles.lastMessage}>
					<span className={styles.creator}>{lastMessage.creator}:</span> {lastMessage.message}
				</div>
			)}
		</Link>
	);
};

export default MainQuestionCard;

function getFirstLine(text: string): string {
	return text.split('\n')[0].replace(/^\*/, '').trim();
}
