import firebaseConfig from '@/controllers/db/configKey';
import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { setMassConsensusStatements } from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { Statement } from '@/types/statement/Statement';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

export function useRandomSuggestions() {
	const navigate = useNavigate();
	const user = useSelector(userSelector);
	const dispatch = useDispatch();
	const [subStatements, setSubStatements] = useState<Statement[]>([]);
	const { statementId } = useParams<{ statementId: string }>();

	useEffect(() => {
		if (!user) navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`);
	}, [user]);

	useEffect(() => {
		fetchRandomStatements();
	}, [statementId]);

	useEffect(() => {
		if (!user) return;
		const unsubscribes = subStatements.map((subStatement) => { return listenToEvaluation(subStatement.statementId) });

		return () => {
			unsubscribes.forEach((unsubscribe) => unsubscribe());
		}
	}, [subStatements, user]);

	const fetchRandomStatements = async () => {
		const endPoint =
			location.hostname === 'localhost'
				? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getRandomStatements?parentId=${statementId}&limit=2`
				: import.meta.env.VITE_APP_RANDOM_STATEMENTS_ENDPOINT;

		if (statementId) {
			try {
				const response = await fetch(endPoint);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const { statements } = await response.json();
				if (!statements) throw new Error('No statements found');

				setSubStatements(statements);
				dispatch(setMassConsensusStatements({ statements, selectionFunction: SelectionFunction.random }));
			} catch (error) {
				console.error('Error:', error);
			}
		}
	};

	return { subStatements };
}
