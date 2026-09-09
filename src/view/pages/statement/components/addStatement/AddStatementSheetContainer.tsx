import { FC, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
	closeAddStatement,
	intentFromType,
	selectAddStatementCommit,
	selectAddStatementIntent,
	selectAddStatementOrigin,
	selectNewStatement,
	selectNewStatementShowModal,
	selectParentStatementForNewStatement,
} from '@/redux/statements/newStatementSlice';
import AddStatementSheet from './AddStatementSheet';

/**
 * Redux-driven mount of the sheet: anything that dispatches openAddStatement
 * (or a legacy setNewStatementModal) opens it. Rendered once, by AppShell,
 * for every route the new shell wraps.
 */
const AddStatementSheetContainer: FC = () => {
	const dispatch = useDispatch();
	const isOpen = useSelector(selectNewStatementShowModal);
	const parent = useSelector(selectParentStatementForNewStatement);
	const newStatement = useSelector(selectNewStatement);
	const intent = useSelector(selectAddStatementIntent);
	const origin = useSelector(selectAddStatementOrigin);
	const commit = useSelector(selectAddStatementCommit);

	const handleClose = useCallback(() => dispatch(closeAddStatement()), [dispatch]);

	if (!isOpen || !parent) return null;

	return (
		<AddStatementSheet
			isOpen={isOpen}
			onClose={handleClose}
			parentStatement={parent}
			intent={intent ?? intentFromType(newStatement?.statementType)}
			origin={origin ?? 'legacy'}
			commit={commit}
			questionType={newStatement?.questionSettings?.questionType}
		/>
	);
};

export default AddStatementSheetContainer;
