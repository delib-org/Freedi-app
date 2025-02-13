import React, { FC } from 'react';
import { useParams } from 'react-router';
import OptionBar from '../optionBar/OptionBar';
import './VotingArea.scss';
import { getSortedVotingOptions, isVerticalOptionBar } from './VotingAreaCont';
import useWindowDimensions from '@/controllers/hooks/useWindowDimentions';
import { Statement } from '@/types/statement/statementTypes';
import { DeliberativeElement } from '@/types/enums';
import { useSelector } from 'react-redux';
import { statementSelectorById, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { SelectionFunction } from '@/types/evaluation/evaluationTypes';

interface VotingAreaProps {
	setStatementInfo: React.Dispatch<
		React.SetStateAction<Statement | undefined>
	>;
	subStatements: Statement[];
	setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
	totalVotes: number;
	isMassConsensus?: boolean;
}

const VotingArea: FC<VotingAreaProps> = ({
	setStatementInfo,
	subStatements,
	setShowInfo,
	totalVotes,
	isMassConsensus = false,
}) => {
	const { statementId, sort } = useParams();
	const statement = useSelector(statementSelectorById(statementId));
	const { width } = useWindowDimensions();
	const massConsensusOptions = useSelector(statementSubsSelector(statementId)).filter((s: Statement) => s.evaluation?.selectionFunction === SelectionFunction.vote);

	if (!statement) return null;

	const _options = isMassConsensus ? massConsensusOptions : statement?.statementSettings?.inVotingGetOnlyResults
		? subStatements.filter((st) => st.isResult)
		: subStatements.filter(
			(st) => st.deliberativeElement === DeliberativeElement.option
		);

	console.log(_options)

	const options = getSortedVotingOptions({
		statement,
		subStatements: _options,
		sort,
	});
	const optionsCount = options.length;

	const shouldShowVerticalBar = isVerticalOptionBar(width, optionsCount);

	return (
		<div
			className={`voting-area ${shouldShowVerticalBar ? 'vertical' : 'horizontal'}`}
		>
			{options.map((option, i) => {
				return (
					<OptionBar
						isVertical={shouldShowVerticalBar}
						key={option.statementId}
						order={i}
						option={option}
						totalVotes={totalVotes}
						statement={statement}
						setShowInfo={setShowInfo}
						setStatementInfo={setStatementInfo}
						optionsCount={optionsCount}
						screenWidth={width}
					/>
				);
			})}
		</div>
	);
};

export default VotingArea;
