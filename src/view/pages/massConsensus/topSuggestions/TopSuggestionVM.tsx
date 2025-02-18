import firebaseConfig from '@/controllers/db/configKey';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { setStatements } from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { Statement } from '@/types/statement/Statement';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

const useTopSuggestions = () => {
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const user = useSelector(userSelector);
	const { statementId } = useParams<{ statementId: string }>();

	const fetchStatements = () => {
		const endPoint =
		location.hostname === 'localhost'
			? `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/getTopStatements?parentId=${statementId}&limit=2`
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
		})
		.catch((error) => console.error('Error:', error));
	}

	useEffect(() => {
		fetchStatements();
		const unsubscribe = listenToEvaluations(dispatch, statementId, user.uid, SelectionFunction.top);
		return () => unsubscribe();
	}, [statementId, user.uid]);

	useEffect(() => {
		if (!user)
			navigate(
				`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`
			);
	}, [user]);

	return {};
};

export default useTopSuggestions;
