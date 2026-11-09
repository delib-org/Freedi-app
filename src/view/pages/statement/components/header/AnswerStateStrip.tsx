import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { getAnswerState } from './answerState';
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
	const answerState = getAnswerState(statement, parentStatement);

	if (answerState === 'none') return null;

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
