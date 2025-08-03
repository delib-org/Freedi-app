import React, { FC } from 'react';
import { useParams } from 'react-router';
import OptionBar from '../optionBar/OptionBar';
import styles from './VotingArea.module.scss';
import { getSortedVotingOptions, isVerticalOptionBar } from './VotingAreaCont';
import useWindowDimensions from '@/controllers/hooks/useWindowDimentions';

import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { Statement, StatementType } from 'delib-npm';

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

	if (!statement) return null;

	const defaultOptions = statement?.statementSettings?.inVotingGetOnlyResults
		? subStatements.filter((st) => st.isResult)
		: subStatements.filter(
			(st) => st.statementType === StatementType.option
		);

	const _options = subStatements || defaultOptions;
	const options = getSortedVotingOptions({
		statement,
		subStatements: _options,
		sort,
	});
	const optionsCount = options.length;

	const shouldShowVerticalBar = isVerticalOptionBar(width, optionsCount);

	return (
		<div
			className={`${styles.votingArea} ${shouldShowVerticalBar ? styles.vertical : styles.horizontal}`}
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
