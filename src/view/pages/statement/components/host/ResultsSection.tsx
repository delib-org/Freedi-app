import { FC, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { createSelector } from '@reduxjs/toolkit';
import { Role, Statement, StatementSubscription, StatementType } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { RootState } from '@/redux/store';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import ChoseBySettings from '../settings/components/choseBy/ChoseBySettings';
import ExportSettings from '../settings/components/advancedSettings/ExportSettings';
import GetVoters from '../settings/components/GetVoters';
import GetEvaluators from '../settings/components/GetEvaluators';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import styles from './HostHub.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface ResultsSectionProps {
	statement: Statement;
	setStatementToEdit: (statement: Statement) => void;
}

/**
 * How the result is chosen, exports, voters and raters. The AI summary is
 * generated from the question screen's Results tab, the one place it lives.
 */
const ResultsSection: FC<ResultsSectionProps> = ({ statement, setStatementToEdit }) => {
	const subsSelect = useMemo(
		() => statementSubsSelector(statement.statementId),
		[statement.statementId],
	);
	const subStatements = useSelector(subsSelect);
	const membersSelect = useMemo(
		() =>
			createSelector(
				(state: RootState) => state.statements.statementMembership,
				(memberships) =>
					memberships.filter(
						(m: StatementSubscription) =>
							m.statementId === statement.statementId && m.role !== Role.banned,
					),
			),
		[statement.statementId],
	);
	const joinedMembers = useAppSelector(membersSelect).map((m) => m.user);
	const isQuestion = statement.statementType === StatementType.question;

	return (
		<div className={styles.liveGrid} data-testid="host-results">
			{isQuestion && (
				<div className={groupWrapClass}>
					<ChoseBySettings statement={statement} setStatementToEdit={setStatementToEdit} />
				</div>
			)}
			<div className={groupWrapClass}>
				<ExportSettings statement={statement} subStatements={subStatements} />
				<GetVoters statementId={statement.statementId} joinedMembers={joinedMembers} />
				<GetEvaluators statementId={statement.statementId} />
			</div>
		</div>
	);
};

export default ResultsSection;
