import { useContext, useEffect, useRef, useState } from 'react';
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

interface Props {
	showStageTitle?: boolean;
	showBottomNav?: boolean;
}

const StagePage = ({ showStageTitle = true, showBottomNav = true }: Props) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const stageRef = useRef<HTMLDivElement>(null);
	const { isGenerating, generateSummary } = useSummarization();
	const { isAdmin } = useEditPermission(statement);
	const [isModalOpen, setIsModalOpen] = useState(false);

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

	const stageName = statement?.statement ? `: ${t(statement.statement)}` : '';
	const isClustering = statement?.evaluationSettings?.evaluationUI === EvaluationUI.clustering;

	return (
		<>
			<div className={`${styles['stage-page']} wrapper`}>
				{!isClustering && showStageTitle && (
					<h2>
						{t('Stage')}
						{statement?.statement && stageName}
					</h2>
				)}

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
