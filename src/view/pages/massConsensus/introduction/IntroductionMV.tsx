import { listenToAuth, signAnonymously } from '@/controllers/db/auth';
import firebaseConfig from '@/controllers/db/configKey';
import {
	setStatement,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { userSelector } from '@/redux/users/userSlice';
import { functionConfig } from '@/types/ConfigFunctions';
import { Statement } from '@/types/statement/Statement';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

export function useIntroductionMV() {
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const user = useSelector(userSelector);

	useEffect(() => {
		listenToAuth(
			navigate,
			true,
			`/mass-consensus/${statementId}/introduction`
		);
	}, []);

	useEffect(() => {
		if (!user) signAnonymously();
	}, [user]);

	useEffect(() => {
		if (!statementId) return;

		setLoading(true);
		getInitialMCData(statementId).then(({ statement, error }) => {
			if (statement) dispatch(setStatement(statement));
			if (error) setError(error);

			setLoading(false);
		});
	}, [statementId]);

	return { statement, loading, error };
}

async function getInitialMCData(
	statementId: string
): Promise<{ statement: Statement | null; error: string }> {
	const deployedEndPoint = import.meta.env.VITE_APP_MASS_CONSENSUS_ENDPOINT;

	const localEndPoint = `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/massConsensusGetInitialData`;

	const requestUrl =
		location.hostname === 'localhost' ? localEndPoint : deployedEndPoint;

	const response = await fetch(`${requestUrl}?statementId=${statementId}`);

	try {
		const data = await response.json();
		if (data.statement) {
			return { statement: data.statement, error: '' };
		} else {
			return { statement: null, error: 'No statement found' };
		}
	} catch (err) {
		console.error(err);

		return { statement: null, error: err.message };
	}
}
