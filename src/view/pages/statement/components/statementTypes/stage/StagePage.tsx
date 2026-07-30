import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import SuggestionCards from '../../evaluations/components/suggestionCards/SuggestionCards';
import styles from './StagePage.module.scss';
import StatementBottomNav from '../../nav/bottom/StatementBottomNav';
import StatementVote from '../../vote/StatementVote';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementContext } from '../../../StatementCont';
import { Statement, EvaluationUI } from '@freedi/shared-types';
import Clustering from '../../clustering/Clustering';
import { useSummarization } from '@/controllers/hooks/useSummarization';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import SummaryDisplay from '../question/document/MultiStageQuestion/components/SummaryDisplay/SummaryDisplay';
import SummarizeModal from '../question/document/MultiStageQuestion/components/SummarizeModal/SummarizeModal';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { Lightbulb, Plus, MessageSquare } from 'lucide-react';

interface Props {
	showBottomNav?: boolean;
}

const StagePage = ({ showBottomNav = true }: Props) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const stageRef = useRef<HTMLDivElement>(null);
	const { isGenerating, generateSummary } = useSummarization();
	const { isAdmin } = useEditPermission(statement);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const subsSelect = useMemo(
		() => statementSubsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const allSubs = useSelector(subsSelect);
	const hasSubStatements = allSubs.length > 0;

	useEffect(() => {
		const updateHeight = () => {
			if (stageRef.current) {
				const topPosition = stageRef.current.getBoundingClientRect().top;
				const viewportHeight = window.innerHeight;
				const newHeight = viewportHeight - topPosition;
				stageRef.current.style.height = `${newHeight + 300}px`;
			}
		};

		// Initial height calculation
		updateHeight();

		// Update height on window resize
		window.addEventListener('resize', updateHeight);

		return () => {
			window.removeEventListener('resize', updateHeight);
		};
	}, []);

	const handleGenerateSummary = async (customPrompt: string) => {
		if (!statement) return;
		const success = await generateSummary(statement.statementId, customPrompt);
		if (success) {
			setIsModalOpen(false);
		}
	};

	// Type assertion for summary fields
	const statementWithSummary = statement as Statement & {
		summary?: string;
		summaryGeneratedAt?: number;
	};

	// The "Stage: …" heading used to render here. It read its title from
	// StatementContext — the same context StatementHeader renders as the page
	// <h1> — so it was always a verbatim duplicate sitting directly under the
	// title. An `isRootStage` guard tried to catch this by comparing
	// statementId to topParentId, but that is only true for a top-level
	// question: every sub-question failed the check and re-printed its own
	// title. Removed rather than re-guarded, because the remaining call sites
	// (QuestionPage, SwitchScreen) always render the routed statement, and the
	// one caller that renders a stage in a list already opted out via the
	// showStageTitle prop.

	return (
		<>
			{hasSubStatements ? (
				<div className={`${styles['stage-page']} wrapper`}>
					{/* Summary Display */}
					<SummaryDisplay
						summary={statementWithSummary?.summary}
						generatedAt={statementWithSummary?.summaryGeneratedAt}
					/>

					{/* Summarize Button - Only visible to admins */}
					{statement && isAdmin && (
						<div className={styles.summarizeWrapper}>
							<button
								className={`btn btn--secondary ${isGenerating ? 'btn--disabled' : ''}`}
								onClick={() => setIsModalOpen(true)}
								disabled={isGenerating}
								aria-label={t('Generate AI summary of the discussion')}
							>
								{isGenerating ? t('Generating...') : t('Summarize Discussion')}
							</button>
						</div>
					)}

					<StagePageSwitch statement={statement} />
				</div>
			) : (
				<div className={styles.onboarding}>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<Lightbulb size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('solutionsOnboarding.shareSolution')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('solutionsOnboarding.shareSolutionDesc')}
							</p>
						</div>
					</div>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<Plus size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('solutionsOnboarding.addSolution')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('solutionsOnboarding.addSolutionDesc')}
							</p>
						</div>
					</div>
					<div className={styles.onboarding__step}>
						<span className={styles.onboarding__icon}>
							<MessageSquare size={20} />
						</span>
						<div className={styles.onboarding__content}>
							<h3 className={styles.onboarding__stepTitle}>
								{t('solutionsOnboarding.convertFromDiscussion')}
							</h3>
							<p className={styles.onboarding__stepText}>
								{t('solutionsOnboarding.convertFromDiscussionDesc')}
							</p>
						</div>
					</div>
				</div>
			)}
			{showBottomNav && (
				<div className={styles.bottomNav}>
					<StatementBottomNav />
				</div>
			)}

			{/* Summarize Modal */}
			{statement && (
				<SummarizeModal
					isOpen={isModalOpen}
					onClose={() => setIsModalOpen(false)}
					onGenerate={handleGenerateSummary}
					isLoading={isGenerating}
					questionTitle={statement.statement}
				/>
			)}
		</>
	);
};

export default StagePage;

interface StagePageSwitchProps {
	readonly statement: Statement;
}

function StagePageSwitch({ statement }: StagePageSwitchProps) {
	const evaluationUI = statement?.evaluationSettings?.evaluationUI;

	switch (evaluationUI) {
		case EvaluationUI.suggestions:
			return <SuggestionCards />;
		case EvaluationUI.voting:
			return <StatementVote />;
		case EvaluationUI.clustering:
			return <Clustering />;
		default:
			return <SuggestionCards />;
	}
}
