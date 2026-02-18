import { useContext, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import StatementBottomNav from '../../../nav/bottom/StatementBottomNav';
import styles from './SimpleQuestion.module.scss';
import SuggestionCards from '../../../evaluations/components/suggestionCards/SuggestionCards';
import Description from '../../../evaluations/components/description/Description';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useSummarization } from '@/controllers/hooks/useSummarization';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import SummaryDisplay from '../document/MultiStageQuestion/components/SummaryDisplay/SummaryDisplay';
import SummarizeModal from '../document/MultiStageQuestion/components/SummarizeModal/SummarizeModal';

const SimpleQuestion = () => {
	const { statement } = useContext(StatementContext);
	const { t } = useTranslation();
	const { isGenerating, generateSummary } = useSummarization();
	const { isAdmin } = useEditPermission(statement);
	const [isModalOpen, setIsModalOpen] = useState(false);

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

	return (
		<div className={styles.simpleQuestion}>
			<div className={styles.wrapper}>
				<Description />

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

				<SuggestionCards />

				<div className={styles.bottomNav}>
					<StatementBottomNav />
				</div>
			</div>

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
		</div>
	);
};

export default SimpleQuestion;
