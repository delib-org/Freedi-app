import React, { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useSummarization } from '@/controllers/hooks/useSummarization';
import newOptionGraphic from '@/assets/images/newOptionGraphic.png';
import InfoIcon from '@/assets/icons/InfoIcon.svg?react';
import EditableDescription from '@/view/components/edit/EditableDescription';
import SummaryDisplay from '../components/SummaryDisplay/SummaryDisplay';
import SummarizeButton from '../components/SummarizeButton/SummarizeButton';
import SummarizeModal from '../components/SummarizeModal/SummarizeModal';
import styles from '../MultiStageQuestion.module.scss';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';

interface IntroductionSectionProps {
	statement: Statement;
}

export const IntroductionSection: FC<IntroductionSectionProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { isGenerating, generateSummary } = useSummarization();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleGenerateSummary = async (customPrompt: string) => {
		const success = await generateSummary(statement.statementId, customPrompt);
		if (success) {
			setIsModalOpen(false);
		}
	};

	// Type assertion for summary fields that may not be in the base Statement type
	const statementWithSummary = statement as Statement & {
		summary?: string;
		summaryGeneratedAt?: number;
	};

	return (
		<div className={styles.stageCard} id="introduction">
			<div className={styles.imgContainer}>
				<img
					draggable={false}
					src={newOptionGraphic}
					alt={t('New Option Graphic')}
					className={styles.graphic}
				/>
			</div>
			<div className={styles.multiStageTitle}>
				<h3>{renderInlineMarkdown(statement.statement)}</h3>
			</div>
			<div className={styles.topicDescription}>
				<InfoIcon />
				<h4>{t('Topic description')}</h4>
			</div>
			<div className={styles.subDescription}>
				<EditableDescription statement={statement} placeholder={t('Add a description...')} />
			</div>

			{/* Summary Display - visible to all users when summary exists */}
			<SummaryDisplay
				summary={statementWithSummary.summary}
				generatedAt={statementWithSummary.summaryGeneratedAt}
			/>

			{/* Summarize Button - admin/creator only */}
			<SummarizeButton
				statement={statement}
				onOpenModal={() => setIsModalOpen(true)}
				isLoading={isGenerating}
			/>

			{/* Summarize Modal */}
			<SummarizeModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onGenerate={handleGenerateSummary}
				isLoading={isGenerating}
				questionTitle={statement.statement}
			/>
		</div>
	);
};
