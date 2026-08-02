import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import Thumb from '@/view/components/thumb/Thumb';
import styles from './SimpleEvaluation.module.scss';
import { Statement } from '@freedi/shared-types';
import { ResultsStrip } from '@/view/components/atomic/molecules/ResultsStrip';

interface Props {
	statement: Statement;
	shouldDisplayScore?: boolean;
	enableEvaluation?: boolean;
}

const SimpleEvaluation: FC<Props> = ({
	statement,
	shouldDisplayScore = true,
	enableEvaluation = true,
}) => {
	// Read accumulated counts from the live evaluation object (server source of
	// truth, kept fresh by the statement listener). The legacy top-level
	// `statement.pro`/`statement.con` fields are no longer written by the
	// evaluation pipeline, so they're only used as a fallback for old data.
	const initialContVotesCount = statement.evaluation?.sumCon ?? statement.con ?? 0;
	const initialProVotesCount = statement.evaluation?.sumPro ?? statement.pro ?? 0;

	// number of people who gave a bad evaluation
	const [conVotesCount, setConVotesCount] = useState(initialContVotesCount);

	// number of people who gave a good evaluation
	const [proVotesCount, setProVotesCount] = useState(initialProVotesCount);

	const evaluation = useAppSelector(evaluationSelector(statement.statementId));

	useEffect(() => {
		setConVotesCount(statement.evaluation?.sumCon ?? statement.con ?? 0);
		setProVotesCount(statement.evaluation?.sumPro ?? statement.pro ?? 0);
	}, [statement.evaluation?.sumCon, statement.evaluation?.sumPro, statement.con, statement.pro]);

	// The whole cluster is a number line: agree first in reading order, then
	// disagree, then the result stats. Laid out as one row rather than a column
	// of (thumbs / stats) — stacking them was most of the card's dead height.
	return (
		<div className={styles.simpleEvaluation}>
			<div className={styles.evaluationBox}>
				<Thumb
					evaluation={evaluation || 0}
					upDown="up"
					statement={statement}
					setProVote={setProVotesCount}
					setConVote={setConVotesCount}
					enableEvaluation={enableEvaluation}
					count={shouldDisplayScore ? proVotesCount : undefined}
				/>
				<Thumb
					evaluation={evaluation || 0}
					upDown="down"
					statement={statement}
					setConVote={setConVotesCount}
					setProVote={setProVotesCount}
					enableEvaluation={enableEvaluation}
					count={shouldDisplayScore ? conVotesCount : undefined}
				/>
			</div>
			{/* Consensus / average / evaluators, labelled — replaces the bare
			    unlabelled consensus decimal that used to sit here. Renders null
			    on its own when there are no evaluators yet. */}
			{shouldDisplayScore && <ResultsStrip statement={statement} className={styles.results} />}
		</div>
	);
};

export default SimpleEvaluation;
