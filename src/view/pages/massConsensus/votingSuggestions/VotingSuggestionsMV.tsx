import firebaseConfig from '@/controllers/db/configKey';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import { Statement, functionConfig, MassConsensusPageUrls } from 'delib-npm';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

export function VotingSuggestionsMV() {
	const { statementId } = useParams<{ statementId: string }>();
	const [subStatements, setSubStatements] = useState<Statement[]>([]);

	const navigate = useNavigate();
	const { user, isLoading } = useAuthentication();

	const navigateToFeedback = () =>
		navigate(
			`/mass-consensus/${statementId}/${MassConsensusPageUrls.leaveFeedback}`
		);

	async function fetchTopStatements() {
		
		const endPoint = location.hostname === 'localhost'
			? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements?parentId=${statementId}&limit=4`
			: `${import.meta.env.VITE_APP_TOP_STATEMENTS_ENDPOINT}?parentId=${statementId}&limit=4`;

		fetch(endPoint)
			.then((res) => res.json())
			.then((data) => {
				const statements = data.statements;

				setSubStatements(statements);
			})
			.catch((err) => console.error(err));
	}

	useEffect(() => {
		const unsubscribe = listenToStatement(statementId);

		return () => unsubscribe();
	}, []);

	useEffect(() => {
		fetchTopStatements();
		const unsubscribe = subStatements.map((subStatement) =>
			listenToStatement(subStatement.statementId)
		);

		return () => unsubscribe.forEach((u) => u());
	}, [subStatements.length]);

	useEffect(() => {
		if (!isLoading && !user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user, isLoading]);

	return { subStatements, statementId, navigateToFeedback };
}
