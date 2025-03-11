import { enhancedEvaluationsThumbs } from "../../../statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel"
import { FC } from 'react'
import styles from './CreatorEvalautionIcon.module.scss';

import { Statement } from "delib-npm"


interface Props {
	evaluationNumber: number,
	statement: Statement
}

const CreatorEvaluationIcon: FC<Props> = ({ evaluationNumber, statement }) => {
	const len = enhancedEvaluationsThumbs.length;
	const normalizedNumber = len - (evaluationNumber + 1) * (len - 1) / 2 - 1

	const thumb = enhancedEvaluationsThumbs[Math.round(normalizedNumber)];
	if (!thumb) return null
	console.log(thumb.colorSelected)

	console.log("normalizedNumber", normalizedNumber, statement.statement)
	return (<div className={styles.evaluationThumb} style={{ backgroundColor: thumb.colorSelected }}><img src={thumb.svg} alt="" /></div>)
}

export default CreatorEvaluationIcon