import { LanguagesEnum } from '@/context/UserConfigContext';
import firebaseConfig from '@/controllers/db/configKey';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	setStatement,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { functionConfig, Statement } from 'delib-npm';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';

export function useIntroductionMV() {
	const dispatch = useDispatch();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const subscription = useSelector(
		statementSubscriptionSelector(statementId)
	);
	const { changeLanguage } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultLanguage = statement?.defaultLanguage;
	useEffect(() => {
		if (!statement) return;

		if (statement.defaultLanguage) {
			changeLanguage(statement.defaultLanguage as LanguagesEnum);
		}
	}, [defaultLanguage]);

	useEffect(() => {
		if (!statementId) return;

		setLoading(true);
		getInitialMCData(statementId).then(({ statement, error }) => {
			if (statement) dispatch(setStatement(statement));
			if (error) setError(error);

			setLoading(false);
		});
	}, [statementId]);

	return { statement, loading, error, subscription };
}

async function getInitialMCData(
	statementId: string
): Promise<{ statement: Statement | null; error: string }> {
	const deployedEndPoint = import.meta.env.VITE_APP_MASS_CONSENSUS_ENDPOINT;

	// Use the project ID from the Firebase configuration
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
