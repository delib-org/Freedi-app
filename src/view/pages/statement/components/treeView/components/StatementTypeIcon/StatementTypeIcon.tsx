import { FC } from 'react';
import { StatementType } from '@freedi/shared-types';
import styles from './StatementTypeIcon.module.scss';

interface StatementTypeIconProps {
	type: StatementType;
	isSelected?: boolean;
}

const StatementTypeIcon: FC<StatementTypeIconProps> = ({ type, isSelected }) => {
	if (type === StatementType.option) {
		const modifier = isSelected ? 'selected' : 'option';

		return (
			<div className={`${styles['statement-type-icon']} ${styles[`statement-type-icon--${modifier}`]}`}>
				{isSelected ? '!!' : '!'}
			</div>
		);
	}

	if (type === StatementType.question) {
		return (
			<div className={`${styles['statement-type-icon']} ${styles['statement-type-icon--question']}`}>
				?
			</div>
		);
	}

	return (
		<div className={`${styles['statement-type-icon']} ${styles['statement-type-icon--statement']}`}>
			&#9993;
		</div>
	);
};

export default StatementTypeIcon;
