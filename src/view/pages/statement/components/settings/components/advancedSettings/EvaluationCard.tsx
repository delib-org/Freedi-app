import { FC } from 'react';
import React from 'react';
import styles from './EnhancedAdvancedSettings.module.scss';
import { CheckSquare } from 'lucide-react';

export interface EvaluationCardProps {
	type: string;
	title: string;
	description: string;
	icon: React.ElementType;
	isSelected: boolean;
	onClick: () => void;
}

const EvaluationCard: FC<EvaluationCardProps> = ({
	type: _type,
	title,
	description,
	icon: Icon,
	isSelected,
	onClick,
}) => (
	<button
		className={`${styles.evaluationCard} ${isSelected ? styles['evaluationCard--selected'] : ''}`}
		onClick={onClick}
		type="button"
	>
		<div className={styles.evaluationCardIcon}>
			<Icon size={24} />
		</div>
		<h4 className={styles.evaluationCardTitle}>{title}</h4>
		<p className={styles.evaluationCardDescription}>{description}</p>
		{isSelected && (
			<div className={styles.evaluationCardCheck}>
				<CheckSquare size={20} />
			</div>
		)}
	</button>
);

export default EvaluationCard;
