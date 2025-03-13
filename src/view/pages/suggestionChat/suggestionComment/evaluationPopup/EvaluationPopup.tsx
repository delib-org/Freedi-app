import { findClosestEvaluation } from '@/controllers/general/helpers'
import { useAppSelector } from '@/controllers/hooks/reduxHooks'
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice'
import EnhancedEvaluation, { EvaluationThumb } from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluation'
import { enhancedEvaluationsThumbs, EnhancedEvaluationThumb } from '@/view/pages/statement/components/evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluationModel'
import { Statement } from 'delib-npm'
import { FC, useState } from 'react'
import styles from './EvaluationPopup.module.scss';

interface Props {
	parentStatement: Statement
}

const EvaluationPopup: FC<Props> = ({ parentStatement }) => {
	const evaluationScore = useAppSelector(
		evaluationSelector(parentStatement.statementId)
	);

	const [showAllEvaluations, setShowAllEvaluations] = useState(false);

	// const enhancedEvaluationsThumb = 
	const thumb: EnhancedEvaluationThumb = findClosestEvaluation(enhancedEvaluationsThumbs, evaluationScore)

	return (
		<div className={styles['evaluation-popup']}>
			{!showAllEvaluations ? <button onClick={() => setShowAllEvaluations(true)} className={styles['evaluation-popup__thumb']} style={{ backgroundColor: thumb.colorSelected }}>
				<EvaluationThumb
					statement={parentStatement}
					evaluationScore={evaluationScore}
					evaluationThumb={thumb}
				/>
			</button> :
				<button onClick={() => setShowAllEvaluations(false)} className={styles['evaluation-popup__thumbs']}>
					<EnhancedEvaluation statement={parentStatement} shouldDisplayScore={false} />
				</button>
			}
		</div>
	)
}

export default EvaluationPopup