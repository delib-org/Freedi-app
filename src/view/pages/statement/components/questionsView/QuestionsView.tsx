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
import { HelpCircle, Plus, MessageSquare } from 'lucide-react';

const QuestionsView: FC = () => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statement?.statementId));
	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;
	const questionsSelect = useMemo(
		() => questionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const questions = useSelector(questionsSelect);
	const visibleQuestions = questions.filter((q) => !q.hide || isAdmin);

	return (
		<div className={styles.questionsView}>
			<header className={styles.heading}>
				<div>
					<h2>{t('Questions')}</h2>
					<p>{t('questionsOnboarding.breakItDownDesc')}</p>
				</div>
			</header>
			{visibleQuestions.length === 0 ? (
				<div className={styles.onboarding}>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<HelpCircle size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('questionsOnboarding.breakItDown')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('questionsOnboarding.breakItDownDesc')}
							</p>
						</div>
					</div>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<Plus size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('questionsOnboarding.addQuestion')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('questionsOnboarding.addQuestionDesc')}
							</p>
						</div>
					</div>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<MessageSquare size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('questionsOnboarding.convertFromDiscussion')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('questionsOnboarding.convertFromDiscussionDesc')}
							</p>
						</div>
					</div>
				</div>
			) : (
				<div className={styles.content}>
					<div className={styles.grid}>
						{visibleQuestions.map((question) => (
							<SubGroupCard key={question.statementId} statement={question} isAdmin={isAdmin} />
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export default QuestionsView;
