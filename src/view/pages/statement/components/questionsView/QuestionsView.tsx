import { FC, useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Role } from '@freedi/shared-types';
import {
	questionsSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { StatementContext } from '../../StatementCont';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './QuestionsView.module.scss';

const QuestionsView: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statement?.statementId));
	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;

	const questionsSelect = useMemo(() => questionsSelector(statement?.statementId), [statement?.statementId]);
	const questions = useSelector(questionsSelect);
	const visibleQuestions = questions.filter((q) => !q.hide || isAdmin);

	if (visibleQuestions.length === 0) {
		return (
			<div className={styles.empty}>
				<p>{t('No questions yet')}</p>
			</div>
		);
	}

	return (
		<div className={styles.questionsView}>
			<div className="wrapper">
				<div className={styles.grid}>
					{visibleQuestions.map((question) => (
						<SubGroupCard key={question.statementId} statement={question} />
					))}
				</div>
			</div>
		</div>
	);
};

export default QuestionsView;
