import { setStatement, statementSelector } from "@/redux/statements/statementsSlice";
import { Statement } from "@/types/statement";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router";

export function useIntroductionMV() {
	const dispatch = useDispatch();

	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

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

async function getInitialMCData(statementId: string): Promise<{ statement: Statement | null, error: string }> {
	const prodEndPoint =
		`https://massConsensusGetInitialData-qeesi7aziq-uc.a.run.app`;
	const localEndPoint = `http://localhost:5001/delib-v3-dev/us-central1/massConsensusGetInitialData`;
	const requestUrl = (location.hostname !== 'localhost') ? prodEndPoint : localEndPoint;

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
