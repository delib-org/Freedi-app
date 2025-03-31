import React, { FC, useState } from 'react';
import { useParams } from 'react-router';
import OptionBar from '../optionBar/OptionBar';
import './VotingArea.scss';
import { getSortedVotingOptions, isVerticalOptionBar } from './VotingAreaCont';
import useWindowDimensions from '@/controllers/hooks/useWindowDimentions';

import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { DeliberativeElement, Statement } from 'delib-npm';

interface VotingAreaProps {
	setStatementInfo: React.Dispatch<
		React.SetStateAction<Statement | undefined>
	>;
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
	const { statementId, sort } = useParams();
	const statement = useSelector(statementSelectorById(statementId));
	const { width } = useWindowDimensions();
	const [ votedOption, setVotedOptioin ] = useState<number>(-1); //for temporary dispaly while loading

	if (!statement) return null;

	const defaultOptions = statement?.statementSettings?.inVotingGetOnlyResults
		? subStatements.filter((st) => st.isResult)
		: subStatements.filter(
			(st) => st.deliberativeElement === DeliberativeElement.option
		);

	const _options = subStatements || defaultOptions;
	const options = getSortedVotingOptions({
		statement,
		subStatements: _options,
		sort,
	});
	const optionsCount = options.length;

	const shouldShowVerticalBar = isVerticalOptionBar(width, optionsCount);

	//helper functions

	const changeVotedOption = (indexPressed) => {
		if (indexPressed === votedOption) setVotedOptioin(-1);
		else setVotedOptioin(indexPressed);
		console.log(votedOption)
	}

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
						changeVotedOption={changeVotedOption(i)}
					/>
				);
			})}
		</div>
	);
};

export default VotingArea;
