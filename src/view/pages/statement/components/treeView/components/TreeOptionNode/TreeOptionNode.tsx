import { FC, useMemo } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import UserAvatar from '@/view/pages/statement/components/chat/components/userAvatar/UserAvatar';
import Evaluation from '@/view/pages/statement/components/evaluations/components/evaluation/Evaluation';
import styles from './TreeOptionNode.module.scss';

interface TreeOptionNodeProps {
	statement: Statement;
	parentStatement: Statement | undefined;
}

function formatMessageTime(timestamp: number): string {
	const date = new Date(timestamp);

	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TreeOptionNode: FC<TreeOptionNodeProps> = ({ statement, parentStatement }) => {
	const { t } = useTranslation();
	const timeString = useMemo(() => formatMessageTime(statement.createdAt), [statement.createdAt]);

	const isInResults =
		parentStatement?.results?.some((result) => result.statementId === statement.statementId) ??
		false;

	const nodeClassName = [
		styles['tree-option-node'],
		isInResults ? styles['tree-option-node--selected'] : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={nodeClassName}>
			<div className={styles['tree-option-node__avatar']}>
				<UserAvatar user={statement.creator} />
			</div>
			<div className={styles['tree-option-node__body']}>
				<div className={styles['tree-option-node__header']}>
					<span className={styles['tree-option-node__author']}>
						{statement.creator.displayName}
					</span>
					<span className={styles['tree-option-node__badge']}>
						{isInResults ? t('Selected Solution') : t('Solution')}
					</span>
					<span className={styles['tree-option-node__time']}>{timeString}</span>
				</div>
				<div className={styles['tree-option-node__text']}>{statement.statement}</div>
				<div className={styles['tree-option-node__evaluation']}>
					<Evaluation statement={statement} />
				</div>
			</div>
		</div>
	);
};

export default TreeOptionNode;
