import { Statement } from 'delib-npm';
import styles from './OptionMCCard.module.scss'
import { FC } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { useSelector } from 'react-redux';
import { statementSelectorById, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import SmileIcon from '@/assets/icons/evaluation/evaluation1.svg?react';

interface Props {
	statement: Statement;
	isDelete?: boolean;
}

const OptionMCCard: FC<Props> = ({ statement, isDelete }) => {
	const role = useSelector(statementSubscriptionSelector(statement.parentId))?.role;
	const parentStatement = useSelector(statementSelectorById(statement.parentId));
	const totalEvaluators = parentStatement.evaluation?.asParentTotalEvaluators || 0;

	const isAdmin = role === 'admin';

	function handleDelete() {
		deleteStatementFromDB(statement, isAdmin);
	}

	return (
		<div className={styles.optionMCCard}>
			<div className={styles.optionMCCardTexts}>
				<p><b>{statement.statement}</b></p>
				{statement.description && <p className={styles.description}>{statement.description}</p>}

			</div>
			<div className={styles.optionMCCardBtns}>

				{isAdmin && isDelete && <button className={styles.optionMCCardBtn} onClick={handleDelete}><DeleteIcon /></button>}
				{!isDelete && <div className={styles.smile}><SmileIcon /></div>}
				<span className={styles.consensus}> {(Math.round(statement.consensus * 100) / 100).toFixed(2)} ({statement.evaluation?.numberOfEvaluators}/{totalEvaluators})</span>
			</div>
		</div>
	)
}

export default OptionMCCard