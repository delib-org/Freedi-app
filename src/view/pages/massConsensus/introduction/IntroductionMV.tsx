import { Statement } from "@/types/statement";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

export function useIntroductionMV() {

	const { statementId } = useParams<{ statementId: string }>();

	const [statement, setStatement] = useState<Statement | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!statementId) return;

		setLoading(true);
		const prodEndPoint =
			`https://massConsensusGetInitialData-qeesi7aziq-uc.a.run.app`;
		const localEndPoint = `http://localhost:5001/delib-v3-dev/us-central1/massConsensusGetInitialData`;
		const requestUrl = (location.hostname !== 'localhost') ? prodEndPoint : localEndPoint;

		fetch(`${requestUrl}?statementId=${statementId}`)
			.then(res => res.json())
			.then(({ statement }) => {
				if (statement) setStatement(statement);
				setLoading(false);
			})
			.catch(err => {
				setError(err.message);
				console.error(err)
			});

	}, [statementId]);

	return { statement, loading, error };
}
