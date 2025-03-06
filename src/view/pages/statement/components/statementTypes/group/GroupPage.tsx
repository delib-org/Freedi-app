import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import styles from './GroupPage.module.scss';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { StatementContext } from '../../../StatementCont';
import './groupPage.scss';
import AddButton from './AddButton';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { StatementType } from "delib-npm"

export default function GroupPage() {
	const { statement } = useContext(StatementContext);

	const subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	);
	const subGroups = subStatements.filter(
		(sub) => sub.statementType === StatementType.group
	);
	const subQuestions = subStatements.filter(
		(sub) => sub.statementType === StatementType.question
	);

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
				<AddButton />
			</div>
		</div>
	);
}
