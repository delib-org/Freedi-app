import React, { FC } from 'react';
import { evaluationType } from '@freedi/shared-types';
import styles from './RatingScaleButtons.module.scss';

interface RatingScaleOption {
	value: evaluationType;
	label: string;
	icon: React.ReactNode;
	toolTip: string;
	score: number; // 0-3, determines intensity
}

interface RatingScaleButtonsProps {
	options: RatingScaleOption[];
	currentValue: evaluationType;
	onClick: (value: evaluationType) => void;
}

const RatingScaleButtons: FC<RatingScaleButtonsProps> = ({
	options,
	currentValue,
	onClick,
}) => {
	return (
		<div className={styles.ratingScaleButtons}>
			{options.map((option) => {
				const isSelected = currentValue === option.value;
				const scoreClass = `score${option.score}`;
				const buttonClass = isSelected ? `${styles.button} ${styles.selected} ${styles[scoreClass]}` : `${styles.button} ${styles[scoreClass]}`;

				return (
					<button
						key={option.value}
						className={buttonClass}
						onClick={() => onClick(option.value)}
						title={option.toolTip}
						type="button"
						aria-pressed={isSelected}
					>
						<div className={styles.iconContainer}>
							{option.icon}
						</div>
						<span className={styles.label}>{option.label}</span>
					</button>
				);
			})}
		</div>
	);
};

export default RatingScaleButtons;
