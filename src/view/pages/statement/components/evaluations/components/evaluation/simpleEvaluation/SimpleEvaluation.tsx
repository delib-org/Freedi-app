import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import Thumb from '@/view/components/thumb/Thumb';
import styles from './SimpleEvaluation.module.scss';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

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
	const { rowDirection } = useTranslation();

	const initialContVotesCount = statement.con ?? 0;
	const initialProVotesCount = statement.pro ?? 0;

	// number of people who gave a bad evaluation
	const [conVotesCount, setConVotesCount] = useState(initialContVotesCount);

	// number of people who gave a good evaluation
	const [proVotesCount, setProVotesCount] = useState(initialProVotesCount);

	const evaluation = useAppSelector(evaluationSelector(statement.statementId));

	const { consensus } = statement;
	const consensusToDisplay = consensus ? Math.round(consensus * 100) / 100 : 0;

	useEffect(() => {
		setConVotesCount(initialContVotesCount);
		setProVotesCount(initialProVotesCount);
	}, [statement.con, statement.pro]);

	return (
		<div className={styles.simpleEvaluation}>
			<div className={styles.evaluationBox} style={{ flexDirection: rowDirection }}>
				{shouldDisplayScore && <span>{conVotesCount}</span>}
				<div className={styles.thumbIcon}>
					<Thumb
						evaluation={evaluation || 0}
						upDown="down"
						statement={statement}
						setConVote={setConVotesCount}
						setProVote={setProVotesCount}
						enableEvaluation={enableEvaluation}
					/>
				</div>
				<div className={styles.thumbIcon}>
					<Thumb
						evaluation={evaluation || 0}
						upDown="up"
						statement={statement}
						setProVote={setProVotesCount}
						setConVote={setConVotesCount}
						enableEvaluation={enableEvaluation}
					/>
				</div>
				{shouldDisplayScore && <span>{proVotesCount}</span>}
			</div>
			{shouldDisplayScore && <div className={styles.totalEvaluations}>{consensusToDisplay}</div>}
		</div>
	);
};

export default SimpleEvaluation;
