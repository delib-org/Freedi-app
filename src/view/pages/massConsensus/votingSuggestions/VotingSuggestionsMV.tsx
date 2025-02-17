import {
	setMassConsensusStatements,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig } from '@/types/ConfigFunctions';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';

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

	async function fetchTopStatements() {
		fetch(
			`http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements?parentId=${statementId}&limit=6`
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
	}
	
	useEffect(() => {
		fetchTopStatements();
		const unsubscribe = listenToSubStatements(statementId);
		return () => unsubscribe()
	}, [statementId]);

	useEffect(() => {
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user]);

	return { subStatements, statementId };
}
