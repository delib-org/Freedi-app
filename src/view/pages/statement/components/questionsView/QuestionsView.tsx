import { FC, useContext, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Role, Statement, StatementType, QuestionType, CompoundPhase } from '@freedi/shared-types';
import {
	questionsSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { StatementContext } from '../../StatementCont';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useSummarization } from '@/controllers/hooks/useSummarization';
import SummaryDisplay from '../statementTypes/question/document/MultiStageQuestion/components/SummaryDisplay/SummaryDisplay';
import SummarizeModal from '../statementTypes/question/document/MultiStageQuestion/components/SummarizeModal/SummarizeModal';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import CompoundIcon from '@/assets/icons/stepsIcon.svg?react';
import SimpleQuestionIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import styles from './QuestionsView.module.scss';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import { HelpCircle, Plus, MessageSquare } from 'lucide-react';

const QuestionsView: FC = () => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statement?.statementId));
	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;
	const statementColor = useStatementColor({ statement });
	const [menuOpen, setMenuOpen] = useState(false);
	const { isGenerating, generateSummary } = useSummarization();
	const [isSummarizeModalOpen, setIsSummarizeModalOpen] = useState(false);

	const handleGenerateSummary = async (customPrompt: string, includeSubQuestions: boolean) => {
		if (!statement) return;
		const success = await generateSummary(statement.statementId, customPrompt, includeSubQuestions);
		if (success) {
			setIsSummarizeModalOpen(false);
		}
	};

	// summaryGeneratedAt is written by the summarize function but not part of StatementSchema
	const statementWithSummary = statement as
		| (Statement & { summaryGeneratedAt?: number })
		| undefined;

	const questionsSelect = useMemo(
		() => questionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const questions = useSelector(questionsSelect);
	const visibleQuestions = questions.filter((q) => !q.hide || isAdmin);

	function handleAddQuestion() {
		if (!statement) return;
		setMenuOpen(false);

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: {
					statementType: StatementType.question,
					questionSettings: { questionType: getDefaultQuestionType() },
				},
				showModal: true,
				isLoading: false,
				error: null,
			}),
		);
	}

	function handleAddCompoundQuestion() {
		if (!statement) return;
		setMenuOpen(false);

		dispatch(
			setNewStatementModal({
				parentStatement: statement,
				newStatement: {
					statementType: StatementType.question,
					questionSettings: {
						questionType: QuestionType.compound,
						compoundSettings: { currentPhase: CompoundPhase.defineQuestion },
					},
				},
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
						<SummaryDisplay
							summary={statementWithSummary?.summary}
							generatedAt={statementWithSummary?.summaryGeneratedAt}
							statementId={statement?.statementId}
							canEdit={isAdmin}
						/>

						{statement && isAdmin && (
							<div className={styles.summarizeWrapper}>
								<button
									className={`btn btn--secondary ${isGenerating ? 'btn--disabled' : ''}`}
									onClick={() => setIsSummarizeModalOpen(true)}
									disabled={isGenerating}
									aria-label={t('Generate AI summary of the discussion')}
								>
									{isGenerating ? t('Generating...') : t('Summarize Discussion')}
								</button>
							</div>
						)}

						<div className={styles.grid}>
							{visibleQuestions.map((question) => (
								<SubGroupCard key={question.statementId} statement={question} />
							))}
						</div>
					</div>
				)}
			</div>

			{statement && (
				<SummarizeModal
					isOpen={isSummarizeModalOpen}
					onClose={() => setIsSummarizeModalOpen(false)}
					onGenerate={handleGenerateSummary}
					isLoading={isGenerating}
					questionTitle={statement.statement}
				/>
			)}

			<div className={styles.addButtonWrapper}>
				<div className={styles.addButtonGroup}>
					{menuOpen && (
						<button
							className={styles.overlay}
							onClick={() => setMenuOpen(false)}
							aria-label={t('Close')}
						/>
					)}
					<div
						className={`${styles.fanMenu} ${menuOpen ? styles.fanMenuOpen : ''}`}
						role="menu"
						aria-hidden={!menuOpen}
					>
						<button
							className={`${styles.fanItem} ${styles.fanItemSimple}`}
							onClick={handleAddQuestion}
							aria-label={t('Simple Question')}
							title={t('Simple Question')}
							tabIndex={menuOpen ? 0 : -1}
							role="menuitem"
						>
							<span className={styles.fanItem__icon}>
								<SimpleQuestionIcon />
							</span>
							<span className={styles.fanItem__label}>{t('Simple Question')}</span>
						</button>
						<button
							className={`${styles.fanItem} ${styles.fanItemCompound}`}
							onClick={handleAddCompoundQuestion}
							aria-label={t('Compound Question')}
							title={t('Compound Question')}
							tabIndex={menuOpen ? 0 : -1}
							role="menuitem"
						>
							<span className={styles.fanItem__icon}>
								<CompoundIcon />
							</span>
							<span className={styles.fanItem__label}>{t('Compound Question')}</span>
						</button>
					</div>
					<button
						className={`${styles.addButton} ${menuOpen ? styles.addButtonActive : ''}`}
						style={statementColor}
						onClick={() => setMenuOpen((open) => !open)}
						aria-label={t('Add a question')}
						aria-expanded={menuOpen}
						aria-haspopup="menu"
					>
						<PlusIcon style={{ color: statementColor.color }} />
					</button>
				</div>
			</div>
		</>
	);
};

export default QuestionsView;
