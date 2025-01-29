import React, { useState } from 'react';
import { FileText, HelpCircle, Users } from 'lucide-react';
import styles from './QuestionSelector.module.scss';

interface Stage {
	icon: React.FC<any>;
	title: string;
	type: 'question' | 'document' | 'consensus';
	content: {
		title: string;
		description: string;
	};
}

const QuestionSelector: React.FC = () => {
	const [currentStage, setCurrentStage] = useState(0);

	const stages: Stage[] = [
		{
			icon: HelpCircle,
			title: 'Simple Question',
			type: 'question',
			content: {
				title: 'Simple Question Stage',
				description: 'Ask a straightforward question to get started'
			}
		},
		{
			icon: FileText,
			title: 'Document',
			type: 'document',
			content: {
				title: 'Document Stage',
				description: 'Review and analyze relevant documentation'
			}
		},
		{
			icon: Users,
			title: 'Mass Consensus',
			type: 'consensus',
			content: {
				title: 'Mass Consensus Stage',
				description: 'Gather and evaluate collective input'
			}
		}
	];

	const handleNext = () => {
		setCurrentStage((prev) => (prev + 1) % stages.length);
	};

	const getStageClassName = (index: number, type: Stage['type']) => {
		const baseClass = styles.stageCircle;
		const activeClass = styles[`stageCircle--${type}`];
		return `${baseClass} ${index === currentStage ? activeClass : ''}`;
	};

	const getStageTitleClassName = (index: number, type: Stage['type']) => {
		const baseClass = styles.stageTitle;
		const activeClass = styles[`stageTitle--${type}`];
		return `${baseClass} ${index === currentStage ? activeClass : ''}`;
	};

	const getIconClassName = (index: number, type: Stage['type']) => {
		const baseClass = styles.icon;
		const activeClass = styles[`icon--${type}`];
		return `${baseClass} ${index === currentStage ? activeClass : ''}`;
	};

	return (
		<div className={styles.container}>
			<div className={styles.stagesContainer}>
				{stages.map((stage, index) => (
					<div key={index} className={styles.stageItem}>
						<button
							className={getStageClassName(index, stage.type)}
							onClick={() => setCurrentStage(index)}
						>
							<stage.icon className={getIconClassName(index, stage.type)} />
						</button>
						<div className={getStageTitleClassName(index, stage.type)}>
							{stage.title}
						</div>
					</div>
				))}
			</div>

			<div className={styles.buttonContainer}>
				<button
					onClick={handleNext}
					className={styles.button}
				>
					Next Stage
				</button>
			</div>

			<div className={styles.contentCard}>
				<h3 className={styles.contentTitle}>
					{stages[currentStage].content.title}
				</h3>
				<p className={styles.contentText}>
					{stages[currentStage].content.description}
				</p>
			</div>
		</div>
	);
};

export default QuestionSelector;