import { enhancedEvaluationsThumbs } from "../../statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel"
import { FC } from 'react'
import EvaluationThumb from "../../statement/components/evaluations/components/evaluation/enhancedEvaluation/EvaluationThumb"
import { Statement } from "delib-npm"

interface Props {
	evaluationNumber: number,
	statement: Statement
}

const CreatorEvaluationIcon: FC<Props> = ({ evaluationNumber, statement }) => {
	const normalizedNumber = Math.ceil((evaluationNumber + 1) * enhancedEvaluationsThumbs.length)

	const thumbNumber = Math.ceil(evaluationNumber * enhancedEvaluationsThumbs.length);
	console.log("thumbNumber", evaluationNumber, enhancedEvaluationsThumbs.length, thumbNumber)
	const thumb = enhancedEvaluationsThumbs[normalizedNumber]
	return (<EvaluationThumb evaluationThumb={thumb} evaluationScore={evaluationNumber} statement={statement} />)
}

export default CreatorEvaluationIcon