import { Statement } from 'delib-npm';
import styles from './OptionMCCard.module.scss'
import { FC } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { useSelector } from 'react-redux';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { statementSelectorById, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import SmileIcon from '@/assets/icons/evaluation/evaluation1.svg?react';

interface Props {
	statement: Statement;
	isDelete?: boolean;
	onAnchorToggle?: (statementId: string, anchored: boolean) => void;
}

const OptionMCCard: FC<Props> = ({ statement, isDelete, onAnchorToggle }) => {
	const role = useSelector(statementSubscriptionSelector(statement.parentId))?.role;
	const parentStatement = useSelector(statementSelectorById(statement.parentId));
	const totalEvaluators = parentStatement.evaluation?.asParentTotalEvaluators || 0;
	const { t } = useUserConfig();

	const isAdmin = role === 'admin';
	const isAnchoredSamplingEnabled = parentStatement?.evaluationSettings?.anchored?.anchored || false;
	const isAnchored = statement.anchored || false;

	function handleDelete() {
		deleteStatementFromDB(statement, isAdmin, t);
	}

	function handleAnchorToggle() {
		if (onAnchorToggle) {
			onAnchorToggle(statement.statementId, !isAnchored);
		}
	}

	return (
		<div className={styles.optionMCCard}>
			<div className={styles.optionMCCardTexts}>
				<p><b>{statement.statement}</b></p>
				{statement.description && <p className={styles.description}>{statement.description}</p>}

			</div>
			<div className={styles.optionMCCardBtns}>
				{isAdmin && isAnchoredSamplingEnabled && !isDelete && (
					<button
						className={`${styles.anchorBtn} ${isAnchored ? styles.anchored : ''}`}
						onClick={handleAnchorToggle}
						title={isAnchored ? t('Unanchor this option') : t('Anchor this option')}
						data-cy={`anchor-toggle-${statement.statementId}`}
					>
						<AnchorIcon />
					</button>
				)}
				{isAdmin && isDelete && <button className={styles.optionMCCardBtn} onClick={handleDelete}><DeleteIcon /></button>}
				{!isDelete && !isAnchoredSamplingEnabled && <div className={styles.smile}><SmileIcon /></div>}
				<span className={styles.consensus}> {(Math.round(statement.consensus * 100) / 100).toFixed(2)} ({statement.evaluation?.numberOfEvaluators}/{totalEvaluators})</span>
			</div>
		</div>
	)
}

export default OptionMCCard