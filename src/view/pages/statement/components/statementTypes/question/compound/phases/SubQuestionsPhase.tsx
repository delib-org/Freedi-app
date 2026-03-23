import { FC, useContext } from 'react';
import { CompoundPhase, Statement } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSubQuestions } from '@/controllers/hooks/compoundQuestion/useCompoundSubQuestions';
import { lockStatement } from '@/controllers/db/compoundQuestion/lockStatement';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import LockedBanner from '../components/LockedBanner';
import styles from '../CompoundQuestion.module.scss';
import { useDispatch } from 'react-redux';
import {
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { StatementType } from '@freedi/shared-types';

const SubQuestionsPhase: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { currentPhase, isAdmin } = useCompoundPhase(statement);
	const { subQuestions, lockedSubQuestions, unlockedSubQuestions } =
		useCompoundSubQuestions(statement);
	const creator = useSelector(creatorSelector);
	const dispatch = useDispatch();

	const isActive = currentPhase === CompoundPhase.subQuestions;

	const handleLockSubQuestion = async (subQuestion: Statement) => {
		if (!creator?.uid || !statement) return;
		await lockStatement({
			statement: subQuestion,
			userId: creator.uid,
			parentStatementId: statement.statementId,
		});
	};

	const handleAddSubQuestion = () => {
		if (!statement) return;
		dispatch(setParentStatement(statement));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
	};

	return (
		<div className={styles.phase}>
			<h3 className={styles.phaseTitle}>{t('Sub-Questions')}</h3>
			<p className={styles.phaseDescription}>
				{t('Identify and organize the sub-questions that need to be addressed')}
			</p>

			{lockedSubQuestions.length > 0 && (
				<div className={styles.subQuestionList}>
					<h4 className={styles.subQuestionListTitle}>{t('Locked sub-questions')}</h4>
					{lockedSubQuestions.map((sq) => (
						<div key={sq.statementId} className={styles.subQuestionItem}>
							<LockedBanner lockedText={sq.statement} />
						</div>
					))}
				</div>
			)}

			{unlockedSubQuestions.length > 0 && (
				<div className={styles.subQuestionList}>
					{unlockedSubQuestions.map((sq) => (
						<div key={sq.statementId} className={styles.subQuestionItem}>
							<SubGroupCard statement={sq} />
							{isAdmin && isActive && (
								<button
									className="phase-admin-controls__btn phase-admin-controls__btn--lock"
									onClick={() => handleLockSubQuestion(sq)}
								>
									{t('Lock')}
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{subQuestions.length === 0 && (
				<p className={styles.emptyMessage}>{t('No sub-questions yet')}</p>
			)}

			{isActive && (
				<div className={styles.addButton}>
					<button className="btn btn--secondary" onClick={handleAddSubQuestion}>
						{t('Add Sub-Question')}
					</button>
				</div>
			)}
		</div>
	);
};

export default SubQuestionsPhase;
