import { FC, useEffect } from 'react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { getAnswerState } from './answerState';
import { useAnswerScoreGate } from '../questionScreen/useAnswerScoreGate';
import styles from './AnswerStateStrip.module.scss';

interface AnswerStateStripProps {
	statement: Statement;
}

/**
 * A thin band under the header bar, shown only inside an answer: wheat while
 * the answer is not chosen, green once it is. The label carries the state in
 * words so it never depends on colour alone.
 */
const AnswerStateStrip: FC<AnswerStateStripProps> = ({ statement }) => {
	const { t } = useTranslation();
	const parentStatement = useAppSelector(statementSelector(statement.parentId));
	const { creator } = useAuthentication();
	const userId = creator?.uid;
	const isAnswer = statement.statementType === StatementType.option;

	// An answer page opened from a link has not loaded the viewer's rating of it.
	useEffect(() => {
		if (!isAnswer || !userId) return;

		return listenToEvaluation(statement.statementId, userId);
	}, [isAnswer, statement.statementId, userId]);

	const { canSee } = useAnswerScoreGate(statement, parentStatement);
	const answerState = getAnswerState(statement, parentStatement);

	if (answerState === 'none' || !canSee) return null;

	const isChosen = answerState === 'chosen';
	const label = isChosen ? t('answerStrip.chosen') : t('answerStrip.notChosen');

	return (
		<div
			className={`${styles['answer-strip']} ${isChosen ? styles['answer-strip--chosen'] : ''}`}
			data-testid="answer-state-strip"
			data-state={answerState}
		>
			<span className={styles['answer-strip__label']}>{label}</span>
		</div>
	);
};

export default AnswerStateStrip;
