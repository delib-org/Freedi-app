import firebaseConfig from '@/controllers/db/configKey';
import { userSelector } from '@/redux/users/userSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import { Statement } from '@/types/statement/Statement';

export function VotingSuggestionsMV() {
	const { statementId } = useParams<{ statementId: string }>();
	const [subStatements, setSubStatements] = useState<Statement[]>([]);

	const navigate = useNavigate();

	const user = useSelector(userSelector);

	async function fetchTopStatements() {
		fetch(
			`http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements?parentId=${statementId}&limit=6`
		)
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
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user]);

	return { subStatements, statementId };
}
