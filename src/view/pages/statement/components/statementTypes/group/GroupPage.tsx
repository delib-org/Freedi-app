import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import styles from './GroupPage.module.scss';
import Button from '@/view/components/buttons/button/Button';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { StatementContext } from '../../../StatementCont';
import './groupPage.scss';
import AddButton from './AddButton';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { QuestionType, StatementType } from '@/types/TypeEnums';

export default function GroupPage() {
	const {
		handleSetNewStatement,
		setNewStatementType,
		statement,
		setNewQuestionType,
	} = useContext(StatementContext);

	const subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	);
	const subGroups = subStatements.filter(
		(sub) => sub.statementType === StatementType.group
	);
	const subQuestions = subStatements.filter(
		(sub) => sub.statementType === StatementType.question
	);

	function handleAddStatement(
		newStatementType: StatementType,
		questionType?: QuestionType
	) {
		setNewStatementType(newStatementType);
		if (questionType) {
			setNewQuestionType(questionType);
		}
		handleSetNewStatement(true);
	}

	return (
		<div className='groupPage'>
			<div className={styles.mainWrapper}>
				<p>{statement?.description}</p>
				<h4>Groups</h4>
				<div className={styles.subElementsWrapper}>
					{subGroups.map((sub) => (
						<SubGroupCard key={sub.statementId} statement={sub} />
					))}
				</div>
				<h4>Questions</h4>
				<div className={styles.subElementsWrapper}>
					{subQuestions.map((sub) => (
						<SubGroupCard key={sub.statementId} statement={sub} />
					))}
				</div>
				<div className='btns'>
					<Button
						text='add group'
						onClick={() => handleAddStatement(StatementType.group)}
					></Button>
					<Button
						text='add mass consensus'
						onClick={() =>
							handleAddStatement(
								StatementType.question,
								QuestionType.massConsensus
							)
						}
					></Button>
					<Button
						text='add question'
						onClick={() =>
							handleAddStatement(
								StatementType.question,
								QuestionType.multiStage
							)
						}
					></Button>
				</div>
				<AddButton />
			</div>
		</div>
	);
}
