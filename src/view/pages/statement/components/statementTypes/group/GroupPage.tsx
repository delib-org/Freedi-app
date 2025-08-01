import { statementSubscriptionSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import styles from './GroupPage.module.scss';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { StatementContext } from '../../../StatementCont';
import './groupPage.scss';
import AddButton from '../../addButton/AddButton';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { Role, StatementType } from "delib-npm"
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

export default function GroupPage() {
	const { t } = useUserConfig();
	const { statement } = useContext(StatementContext);
	const subscription = useSelector(statementSubscriptionSelector(statement?.statementId));

	const isAdmin = subscription?.role === Role.admin || subscription?.role === Role.creator;

	const subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	);
	const subGroups = subStatements.filter(
		(sub) => sub.statementType === StatementType.group && (!sub.hide || isAdmin)
	);
	const subQuestions = subStatements.filter(
		(sub) => sub.statementType === StatementType.question && (!sub.hide || isAdmin)
	);

	return (
		<div className='groupPage'>
			<div className={styles.mainWrapper}>
				<p>{statement?.description}</p>
				{subGroups.length > 0 && <h4>{t("Groups")}</h4>}
				<div className={styles.subElementsWrapper}>
					{subGroups.map((sub) => (
						<SubGroupCard key={sub.statementId} statement={sub} />
					))}
				</div>
				{subQuestions.length > 0 && <h4>{t("Questions")}</h4>}
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
