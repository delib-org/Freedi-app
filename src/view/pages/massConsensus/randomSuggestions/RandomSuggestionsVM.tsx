import firebaseConfig from '@/controllers/db/configKey';
import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { setMassConsensusStatements } from '@/redux/statements/statementsSlice';
import {
	Statement,
	MassConsensusPageUrls,
	functionConfig,
	SelectionFunction,
} from 'delib-npm';

import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

export function useRandomSuggestions() {
	const navigate = useNavigate();
	const { user, isLoading } = useAuthentication();
	const dispatch = useDispatch();
	const [subStatements, setSubStatements] = useState<Statement[]>([]);
	const { statementId } = useParams<{ statementId: string }>();
	const [loadingStatements, setLoadingStatements] = useState(true);

	const navigateToTop = () =>
		navigate(
			`/mass-consensus/${statementId}/${MassConsensusPageUrls.topSuggestions}`
		);

	useEffect(() => {
		if (!isLoading && !user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user, isLoading]);

	useEffect(() => {
		fetchRandomStatements();
	}, [statementId]);

	useEffect(() => {
		if (!user) return;
		const unsubscribes = subStatements.map((subStatement) => {
			return listenToEvaluation(subStatement.statementId, user.uid);
		});

		return () => {
			unsubscribes.forEach((unsubscribe) => unsubscribe());
		};
	}, [subStatements, user]);

	const fetchRandomStatements = async () => {
		const endPoint =
			location.hostname === 'localhost'
				? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getRandomStatements?parentId=${statementId}&limit=6`
				: `${import.meta.env.VITE_APP_RANDOM_STATEMENTS_ENDPOINT}?parentId=${statementId}&limit=6`;

		if (statementId) {
			try {
				const response = await fetch(endPoint);
				if (!response.ok) {
					const { error } = await response.json();
					console.error('Error:', error);
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const { statements } = await response.json();
				if (!statements) throw new Error('No statements found');

				setSubStatements(statements);
				dispatch(
					setMassConsensusStatements({
						statements,
						selectionFunction: SelectionFunction.random,
					})
				);
				setLoadingStatements(false);
			} catch (error) {
				console.error('Error:', error);
			}
		}
	};

	return { subStatements, navigateToTop, loadingStatements };
}
