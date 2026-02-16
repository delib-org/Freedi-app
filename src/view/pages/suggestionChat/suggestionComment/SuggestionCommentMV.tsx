import { listenToEvaluation } from '@/controllers/db/evaluation/getEvaluation';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { Statement } from '@freedi/shared-types';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

interface Props {
	parentStatement: Statement;
	statement: Statement;
}

export function useSuggestionComment({ parentStatement, statement }: Props) {
	//get user evaluation
	const [evaluationNumber, setEvaluationNumber] = useState<number | undefined>(undefined);
	const creator = statement.creator;
	const _evaluationNumber: number | undefined = useSelector(
		evaluationSelector(parentStatement.statementId, creator?.uid),
	);

	useEffect(() => {
		const unsubscribe = listenToEvaluation(parentStatement.statementId, creator?.uid);

		return () => unsubscribe();
	}, [creator?.uid]);

	useEffect(() => {
		if (_evaluationNumber !== undefined) {
			setEvaluationNumber(_evaluationNumber);
		}
	}, [_evaluationNumber]);

	return { evaluationNumber };
}
