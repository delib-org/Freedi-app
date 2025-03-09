import firebaseConfig from '@/controllers/db/configKey';
import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import {
	setStatement,
	setStatements,
	statementSelectorById,
} from '@/redux/statements/statementsSlice';
import {
	functionConfig,
	Statement,
	MassConsensusPageUrls,
	SelectionFunction,
} from 'delib-npm';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

const useTopSuggestions = () => {
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelectorById(statementId));
	const { user } = useAuthentication();

	const [topStatements, setTopStatements] = useState<Statement[]>([]);

	const navigateToVoting = () =>
		navigate(
			`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}`
		);

	const fetchStatements = () => {
		const endPoint =
			location.hostname === 'localhost'
				? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements?parentId=${statementId}&limit=6`
				: import.meta.env.VITE_APP_TOP_STATEMENTS_ENDPOINT;

		fetch(endPoint)
			.then((response) => response.json())
			.then((data) => {
				const options = data.statements.map((st: Statement) => ({
					...st,
					evaluation: {
						...st.evaluation,
						selectionFunction: SelectionFunction.top,
					},
				}));
				dispatch(setStatements(options));
				setTopStatements(options);
			})
			.catch((error) => console.error('Error:', error));
	};

	useEffect(() => {
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, []);

	useEffect(() => {
		if (statement) {
			if (
				statement.statementSettings.showEvaluation === undefined ||
				statement.statementSettings.showEvaluation === null ||
				statement.statementSettings.showEvaluation === true
			) {
				const statementDontShowEvaluation = {
					...statement,
					statementSettings: {
						...statement.statementSettings,
						showEvaluation: false,
					},
				};

				dispatch(setStatement(statementDontShowEvaluation));
			}
		}
	}, [statement]);

	useEffect(() => {
		fetchStatements();
	}, [statementId, user.uid]);

	useEffect(() => {
		const unSubscribes = topStatements.map((statement) => {
			return listenToEvaluation(statement.statementId, user.uid);
		});

		return () => {
			unSubscribes.forEach((unSubscribe) => unSubscribe());
		};
	}, [topStatements.length]);

	return { navigateToVoting };
};

export default useTopSuggestions;
