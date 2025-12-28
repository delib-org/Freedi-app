import { FC, useEffect, useState } from 'react';

// Third party imports
import { useParams } from 'react-router';

// Redux Store
import StatementSettingsForm from './components/statementSettingsForm/StatementSettingsForm';
import { defaultEmptyStatement } from './emptyStatementModel';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToMembers } from '@/controllers/db/statements/listenToStatements';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	setStatement,
	statementSelector,
} from '@/redux/statements/statementsSlice';

// Hooks & Helpers

// Custom components
import Loader from '@/view/components/loaders/Loader';
import { Statement } from '@freedi/shared-types';
import MembersManagement from './components/membership/MembersManagement';

const StatementSettings: FC = () => {
	// * Hooks * //
	const { statementId } = useParams();
	const { t } = useTranslation();

	// * State * //
	const [parentStatement, setParentStatement] = useState<Statement | 'top'>(
		'top'
	);
	const [isLoading] = useState(false);
	const [statementToEdit, setStatementToEdit] = useState<
		Statement | undefined
	>();

	// * Redux * //
	const dispatch = useAppDispatch();
	const statement: Statement | undefined = useAppSelector(
		statementSelector(statementId)
	);

	useEffect(() => {
		try {
			if (statement) {
				setStatementToEdit(statement);

				if (statement.parentId === 'top') {
					setParentStatement('top');

					return;
				}

				//get parent statement
				getStatementFromDB(statement.parentId)
					.then((parentStatement) => {
						try {
							if (!parentStatement)
								throw new Error('no parent statement');

							setParentStatement(parentStatement);
						} catch (error) {
							console.error(error);
						}
					})
					.catch((error) => {
						console.error(error);
					});
			}
		} catch (error) {
			console.error(error);
		}
	}, [statement]);

	useEffect(() => {
		try {
			let unsubscribe: undefined | (() => void);

			if (statementId) {
				unsubscribe = listenToMembers(dispatch)(statementId);

				if (statement) {
					setStatementToEdit(statement);
				} else {
					(async () => {
						const statementDB =
							await getStatementFromDB(statementId);
						if (statementDB) {
							dispatch(setStatement(statementDB));
							setStatementToEdit(statementDB);
						}
					})();
				}
			} else {
				setStatementToEdit(defaultEmptyStatement);
			}

			return () => {
				if (unsubscribe) unsubscribe();

			};
		} catch (error) {
			console.error(error);
		}
	}, [statementId]);

	return (
		<div className='test'>
			{isLoading || !statementToEdit ? (
				<div className='center'>
					<h2>{t('Updating')}</h2>
					<Loader />
				</div>
			) : (
				<>

					<StatementSettingsForm
						statement={statementToEdit}
						parentStatement={parentStatement}
						setStatementToEdit={setStatementToEdit}
					/>
					<MembersManagement statement={statementToEdit} />
				</>
			)}
		</div>
	);
};

export default StatementSettings;
