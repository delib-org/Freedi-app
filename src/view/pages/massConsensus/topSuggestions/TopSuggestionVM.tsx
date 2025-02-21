import firebaseConfig from '@/controllers/db/configKey';
import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { setStatement, setStatements, statementSelectorById } from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { Statement } from '@/types/statement/Statement';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

const useTopSuggestions = () => {
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const user = useSelector(userSelector);
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelectorById(statementId));

	const [topStatements, setTopStatements] = useState<Statement[]>([]);

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
	}

	useEffect(() => {
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, []);

	useEffect(() => {
		if (statement) {
			if (statement.statementSettings.showEvaluation === undefined || statement.statementSettings.showEvaluation === null || statement.statementSettings.showEvaluation === true) {
				const statementDontShowEvaluation = {
					...statement, statementSettings: {
						...statement.statementSettings, showEvaluation: false
					}
				};

				dispatch(setStatement(statementDontShowEvaluation));
			}
		}
	}, [statement]);

	useEffect(() => {
		fetchStatements();
	}, [statementId, user?.uid]);

	useEffect(() => {
		const unSubscribes = topStatements.map((statement) => {
			return listenToEvaluation(statement.statementId);
		});

		return () => {
			unSubscribes.forEach((unSubscribe) => unSubscribe());
		};
	}, [topStatements.length]);

	return {};
};

export default useTopSuggestions;
