import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { APIEndPoint } from '@/controllers/general/helpers';
import { setMassConsensusStatements } from '@/redux/statements/statementsSlice';
import {
	Statement,
	MassConsensusPageUrls,
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
		if (statementId) {
			try {
				const endPoint = APIEndPoint('getRandomStatements', {
					parentId: statementId,
					limit: 6,
				});

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
