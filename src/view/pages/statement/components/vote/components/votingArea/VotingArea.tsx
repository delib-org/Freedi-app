import React, { FC, useMemo } from 'react';
import { useParams } from 'react-router';
import { OptionBar } from '../optionBar/OptionBar';
import styles from './VotingArea.module.scss';
import { getSortedVotingOptions, isVerticalOptionBar } from './VotingAreaCont';
import useWindowDimensions from '@/controllers/hooks/useWindowDimensions';

import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { Statement, StatementType } from '@freedi/shared-types';

interface VotingAreaProps {
	setStatementInfo: React.Dispatch<React.SetStateAction<Statement | undefined>>;
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

	// Memoize filtered options to prevent recalculation on every render
	const filteredOptions = useMemo(() => {
		if (!statement) return [];

		const defaultOptions = statement.statementSettings?.inVotingGetOnlyResults
			? subStatements.filter((st) => st.isResult)
			: subStatements.filter((st) => st.statementType === StatementType.option);

		return subStatements || defaultOptions;
	}, [statement, subStatements]);

	// Memoize sorted options to prevent expensive sort on every render
	const options = useMemo(() => {
		if (!statement) return [];

		return getSortedVotingOptions({
			statement,
			subStatements: filteredOptions,
			sort,
		});
	}, [statement, filteredOptions, sort]);

	const optionsCount = options.length;
	const shouldShowVerticalBar = useMemo(
		() => isVerticalOptionBar(width, optionsCount),
		[width, optionsCount],
	);

	if (!statement) return null;

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
