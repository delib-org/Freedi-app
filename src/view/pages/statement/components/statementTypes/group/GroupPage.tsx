import { statementSubscriptionSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { useContext } from 'react';
import { useSelector } from 'react-redux';
import { StatementContext } from '../../../StatementCont';
import styles from './GroupPage.module.scss';
import AddButton from '../../addButton/AddButton';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import { Role, StatementType } from "@freedi/shared-types"
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { hasParagraphsContent, getParagraphsText } from '@/utils/paragraphUtils';

export default function GroupPage() {
	const { t } = useTranslation();
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

	const paragraphsText = hasParagraphsContent(statement?.paragraphs) ? getParagraphsText(statement?.paragraphs) : null;

	return (
		<div className={styles.groupPage}>
			<div className={`wrapper`}>
				{paragraphsText && <p>{paragraphsText}</p>}
				{subGroups.length > 0 && <h4>{t("Groups")}</h4>}
				<div className={styles.wrapper}>
					{subGroups.map((sub) => (
						<SubGroupCard key={sub.statementId} statement={sub} />
					))}
				</div>
				{subQuestions.length > 0 && <h4>{t("Questions")}</h4>}
				<div className={styles.wrapper}>
					{subQuestions.map((sub) => (
						<SubGroupCard key={sub.statementId} statement={sub} />
					))}
				</div>
				<AddButton />
			</div>
		</div>
	);
}
