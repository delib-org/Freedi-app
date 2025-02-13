import {
	setMassConsensusStatements,
	setStatements,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { MassConsensusPageUrls } from '@/types/enums';
import { SelectionFunction } from '@/types/evaluation';
import { Statement } from '@/types/statement/statementTypes';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

export function VotingSuggestionsMV() {
	const { statementId } = useParams<{ statementId: string }>();

	const navigate = useNavigate();

	const dispatch = useDispatch();
	const user = useSelector(userSelector);
	const subStatements = useSelector(
		statementSubsSelector(statementId)
	).filter(
		(statement) =>
			statement.evaluation.selectionFunction === SelectionFunction.vote
	);

	useEffect(() => {
		fetch(
			`http://localhost:5001/delib-v3-dev/us-central1/getTopStatements?parentId=${statementId}&limit=6`
		)
			.then((res) => res.json())
			.then((data) => {
				const statements = data.statements;

				dispatch(
					setMassConsensusStatements({
						statements,
						selectionFunction: SelectionFunction.vote,
					})
				);
			})
			.catch((err) => console.error(err));
	}, [statementId]);
	useEffect(() => {
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}`
			);
	}, [user]);

	return { subStatements, statementId };
}
