import { useEffect, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToMembers } from '@/controllers/db/statements/listenToStatements';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { setStatement, statementSelector } from '@/redux/statements/statementsSlice';
import { defaultEmptyStatement } from './emptyStatementModel';

export interface StatementSettingsData {
	statementToEdit: Statement | undefined;
	setStatementToEdit: (statement: Statement) => void;
	parentStatement: Statement | 'top';
}

/**
 * Everything the settings screens need before they can render: the statement
 * (fetched when Redux doesn't have it yet), its parent, and a live members
 * listener. Shared by the legacy settings page and the Host hub.
 */
export function useStatementSettingsData(statementId: string | undefined): StatementSettingsData {
	const dispatch = useAppDispatch();
	const statement = useAppSelector(statementSelector(statementId));
	const [parentStatement, setParentStatement] = useState<Statement | 'top'>('top');
	const [statementToEdit, setStatementToEdit] = useState<Statement | undefined>();

	useEffect(() => {
		if (!statement) return;
		setStatementToEdit(statement);
		if (statement.parentId === 'top') {
			setParentStatement('top');

			return;
		}
		getStatementFromDB(statement.parentId)
			.then((parent) => {
				if (!parent) throw new Error('no parent statement');
				setParentStatement(parent);
			})
			.catch((error) => {
				logError(error, {
					operation: 'settings.useStatementSettingsData.parent',
					statementId: statement.statementId,
				});
			});
	}, [statement]);

	useEffect(() => {
		let unsubscribe: undefined | (() => void);
		try {
			if (statementId) {
				unsubscribe = listenToMembers(dispatch)(statementId);
				if (statement) {
					setStatementToEdit(statement);
				} else {
					getStatementFromDB(statementId).then((fromDb) => {
						if (fromDb) {
							dispatch(setStatement(fromDb));
							setStatementToEdit(fromDb);
						}
					});
				}
			} else {
				setStatementToEdit(defaultEmptyStatement);
			}
		} catch (error) {
			logError(error, { operation: 'settings.useStatementSettingsData.listen', statementId });
		}

		return () => {
			if (unsubscribe) unsubscribe();
		};
		// The statement dependency is deliberately omitted: this effect owns the
		// listener lifetime, the effect above tracks statement changes.
	}, [statementId, dispatch]);

	return { statementToEdit, setStatementToEdit, parentStatement };
}
