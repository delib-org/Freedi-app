import { FC, useContext, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Role, StatementType } from '@freedi/shared-types';
import {
	questionsSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { StatementContext } from '../../StatementCont';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import styles from './QuestionsView.module.scss';
import { HelpCircle, Plus, MessageSquare } from 'lucide-react';

const QuestionsView: FC = () => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statement?.statementId));
	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;
	const statementColor = useStatementColor({ statement });

	const questionsSelect = useMemo(
		() => questionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const questions = useSelector(questionsSelect);
	const visibleQuestions = questions.filter((q) => !q.hide || isAdmin);

	function handleAddQuestion() {
		if (!statement) return;

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: { statementType: StatementType.question },
				showModal: true,
				isLoading: false,
				error: null,
			}),
		);
	}

	return (
		<>
			<div className={styles.questionsView}>
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
					<div className="wrapper">
						<div className={styles.grid}>
							{visibleQuestions.map((question) => (
								<SubGroupCard key={question.statementId} statement={question} />
							))}
						</div>
					</div>
				)}
			</div>

			<div className={styles.addButtonWrapper}>
				<button
					className={styles.addButton}
					style={statementColor}
					onClick={handleAddQuestion}
					aria-label={t('Add a question')}
				>
					<PlusIcon style={{ color: statementColor.color }} />
				</button>
			</div>
		</>
	);
};

export default QuestionsView;
