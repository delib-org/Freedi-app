import React, { FC, useContext } from 'react';
import { useParams } from 'react-router-dom';
import OptionBar from '../optionBar/OptionBar';
import './VotingArea.scss';
import { getSortedVotingOptions, isVerticalOptionBar } from './VotingAreaCont';
import useWindowDimensions from '@/controllers/hooks/useWindowDimentions';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { Statement } from '@/types/statement';
import { DeliberativeElement } from '@/types/enums';

interface VotingAreaProps {
	setStatementInfo: React.Dispatch<React.SetStateAction<Statement | null>>;
	subStatements: Statement[];
	setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
	totalVotes: number;
}

const VotingArea: FC<VotingAreaProps> = ({
	setStatementInfo,
	subStatements,
	setShowInfo,
	totalVotes,
}) => {
	const { sort } = useParams();
	const { statement } = useContext(StatementContext);
	const { width } = useWindowDimensions();

	if (!statement) return null;

	const _options = statement?.statementSettings?.inVotingGetOnlyResults
		? subStatements.filter((st) => st.isResult)
		: subStatements.filter(
			(st) => st.deliberativeElement === DeliberativeElement.option
		);

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
