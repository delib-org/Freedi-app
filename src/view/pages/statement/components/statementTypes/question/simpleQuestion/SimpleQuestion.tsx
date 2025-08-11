import { useContext } from 'react'
import { StatementContext } from '../../../../StatementCont'
import StatementBottomNav from '../../../nav/bottom/StatementBottomNav'
import styles from './SimpleQuestion.module.scss'
import SuggestionCards from '../../../evaluations/components/suggestionCards/SuggestionCards'
import Description from '../../../evaluations/components/description/Description'

const SimpleQuestion = () => {
	const { statement, currentQuestion } = useContext(StatementContext);
	
	console.info('SimpleQuestion render:', {
		currentQuestion,
		statement: statement?.statement,
		statementId: statement?.statementId,
		description: statement?.description
	});
	
	// In questionnaire mode, prioritize currentQuestion data
	// Otherwise use statement data
	const questionText = currentQuestion?.question || statement?.statement;
	const questionDescription = currentQuestion?.description || statement?.description;

	return (
		<div className={styles.simpleQuestion}>
			<div className={styles.wrapper}>
				{questionText && (
					<div className={styles.questionSection}>
						<h2 className={styles.questionText}>{questionText}</h2>
					</div>
				)}
				
				{questionDescription && (
					<div className={styles.descriptionSection}>
						<p>{questionDescription}</p>
					</div>
				)}
				
				{/* Only show Description component if we have a statement with description */}
				{statement?.description && !currentQuestion && <Description />}

				<SuggestionCards />

				<div className={styles.bottomNav}>
					<StatementBottomNav />
				</div>
			</div>
		</div>
	)
}

export default SimpleQuestion