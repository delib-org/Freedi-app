import { enhancedEvaluationsThumbs } from '../../../statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel';
import { FC } from 'react';
import styles from './CreatorEvaluationIcon.module.scss';

interface Props {
	evaluationNumber: number;
}

const CreatorEvaluationIcon: FC<Props> = ({ evaluationNumber }) => {
	const len = enhancedEvaluationsThumbs.length;
	const normalizedNumber = len - ((evaluationNumber + 1) * (len - 1)) / 2 - 1;

	const thumb = enhancedEvaluationsThumbs[Math.round(normalizedNumber)];
	if (!thumb) return null;

	return (
		<div className={styles.evaluationThumb} style={{ backgroundColor: thumb.colorSelected }}>
			<img src={thumb.svg} alt="" />
		</div>
	);
};

export default CreatorEvaluationIcon;
