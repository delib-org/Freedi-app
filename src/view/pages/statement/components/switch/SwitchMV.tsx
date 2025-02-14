import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementSelectorById,
} from '@/redux/statements/statementsSlice';
import { useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { StatementContext } from '../../StatementCont';
import { StatementType } from '@/types/TypeEnums';

export function useSwitchMV() {
	const dispatch = useDispatch();
	//get parent statement
	const { statementId } = useParams();
	const { statement } = useContext(StatementContext);
	const parentStatement = useSelector(
		statementSelectorById(statement?.parentId)
	);

	useEffect(() => {
		if (
			!parentStatement &&
			statementId &&
			statement?.statementType === StatementType.stage
		) {
			getStatementFromDB(statement?.parentId).then((statement) => {
				if (statement) {
					dispatch(setStatement(statement));
				}
			});
		}
	}, [parentStatement?.statementId, statement?.statementId, statementId]);

	return { parentStatement };
}
