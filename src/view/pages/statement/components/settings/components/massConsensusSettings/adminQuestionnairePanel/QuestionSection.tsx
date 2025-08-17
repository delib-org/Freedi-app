import React, { useState } from 'react';
import {
	SortableContext,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { MassConsensusStep, LoginType } from 'delib-npm';
import StepItem from './StepItem';
import Button from '@/view/components/buttons/button/Button';
import styles from './QuestionSection.module.scss';
import ArrowDownIcon from '@/assets/icons/arrow-down.svg?react';
import ArrowUpIcon from '@/assets/icons/arrowUpIcon.svg?react';

interface Props {
	questionId: string;
	title: string;
	steps: MassConsensusStep[];
	onAddStep: () => void;
	loginType: LoginType;
}

const QuestionSection: React.FC<Props> = ({
	questionId,
	title,
	steps,
	onAddStep,
	loginType,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);

	const stepIds = steps.map((step, index) => 
		step?.screen 
			? `${step.screen}-${questionId}-${index}` 
			: `step-${questionId}-${index}`
	);

	return (
		<div className={styles.questionSection}>
			<div 
				className={styles.header}
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<h3>{title}</h3>
				<div className={styles.chevron}>
					{isExpanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
				</div>
			</div>

			{isExpanded && (
				<div className={styles.content}>
					<SortableContext
						items={stepIds}
						strategy={verticalListSortingStrategy}
					>
						<div className={styles.steps}>
							{steps.map((step, index) => {
								const stepId = step?.screen 
									? `${step.screen}-${questionId}-${index}` 
									: `step-${questionId}-${index}`;

								return (
									<StepItem
										key={stepId}
										id={stepId}
										step={step}
										index={index}
										questionId={questionId}
										loginType={loginType}
									/>
								);
							})}
						</div>
					</SortableContext>

					<div className={styles.addStepWrapper}>
						<Button
							text="add step"
							onClick={onAddStep}
							className={styles.addStepBtn}
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export default QuestionSection;