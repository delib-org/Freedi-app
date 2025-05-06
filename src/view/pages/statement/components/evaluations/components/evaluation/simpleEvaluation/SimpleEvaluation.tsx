import { FC, useEffect, useState } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import Thumb from '@/view/components/thumb/Thumb';
import './SimpleEvaluation.scss';
import { Statement } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	statement: Statement;
	shouldDisplayScore?: boolean;
}

const SimpleEvaluation: FC<Props> = ({
	statement,
	shouldDisplayScore = true,
}) => {
	const { rowDirection } = useUserConfig();

	const initialContVotesCount = statement.con ?? 0;
	const initialProVotesCount = statement.pro ?? 0;

	// number of people who gave a bad evaluation
	const [conVotesCount, setConVotesCount] = useState(initialContVotesCount);

	// number of people who gave a good evaluation
	const [proVotesCount, setProVotesCount] = useState(initialProVotesCount);

	const evaluation = useAppSelector(
		evaluationSelector(statement.statementId)
	);

	const { consensus } = statement;
	const consensusToDisplay = consensus
		? Math.round(consensus * 100) / 100
		: 0;

	useEffect(() => {
		setConVotesCount(initialContVotesCount);
		setProVotesCount(initialProVotesCount);
	}, [statement.con, statement.pro]);

	return (
		<div className='simple-evaluation'>
			<div
				className='evaluation-box'
				style={{ flexDirection: rowDirection }}
			>
				{shouldDisplayScore && <span>{conVotesCount}</span>}
				<div className='thumb-icon'>
					<Thumb
						evaluation={evaluation || 0}
						upDown='down'
						statement={statement}
						setConVote={setConVotesCount}
						setProVote={setProVotesCount}
					/>
				</div>
				<div className='thumb-icon'>
					<Thumb
						evaluation={evaluation || 0}
						upDown='up'
						statement={statement}
						setProVote={setProVotesCount}
						setConVote={setConVotesCount}
					/>
				</div>
				{shouldDisplayScore && <span>{proVotesCount}</span>}
			</div>
			{shouldDisplayScore && (
				<div className='total-evaluations'>{consensusToDisplay}</div>
			)}
		</div>
	);
};

export default SimpleEvaluation;
