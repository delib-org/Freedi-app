import { FC } from 'react';

// Redux store
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';

// Statements helpers
import { getSelections } from '../../statementVoteCont';
import InfoIcon from '@/assets/icons/infoCircleIcon.svg?react';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import { OptionBarProps } from '../../voteTypesHelper';
import styles from './OptionBar.module.scss';
import { getBarWidth } from './OptionBarCont';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { setVoteToDB } from '@/controllers/db/vote/setVote';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { parentVoteSelector, setVoteToStore } from '@/redux/vote/votesSlice';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

export const OptionBar: FC<OptionBarProps> = ({
	option,
	totalVotes,
	statement,
	order,
	setStatementInfo,
	setShowInfo,
	isVertical,
	optionsCount,
	screenWidth,
}) => {
	const { creator } = useAuthentication();
	// * Redux * //
	const dispatch = useAppDispatch();
	const vote = useAppSelector(parentVoteSelector(option.parentId));

	// * Variables * //
	const _optionOrder = option.order || 0;
	const selections: number = getSelections(statement, option);

	const barWidth = getBarWidth({
		isVertical,
		totalOptionsCount: optionsCount,
		screenWidth,
	});
	const padding = 40;
	const { shortVersion } = statementTitleToDisplay(option.statement, 30);
	const barHeight =
		selections > 0 && totalVotes > 0
			? Math.round((selections / totalVotes) * 100)
			: 0;
	const handleVotePress = () => {
		dispatch(setVoteToStore(option));
		setVoteToDB(option, creator);
		getStatementFromDB(option.statementId);
	};
	const isOptionSelected = vote?.statementId === option.statementId;

	const containerInset = `${(_optionOrder - order) * barWidth}px`;
	const containerStyle = {
		[isVertical ? 'right' : 'left']: containerInset,
		width: `${barWidth}px`,
	};

	const voteButtonStyle = {
		width: `${barWidth - padding}px`,
		backgroundColor: isOptionSelected ? option.color : 'White',
	};

	const barStyle = {
		height: `${barHeight}%`,
		width: `${barWidth - padding}px`,
		backgroundColor: option.color,
	};

	const shouldShowStat = barHeight > 0;

	return (
		<div
			className={`${styles.optionBar} ${isVertical ? styles.vertical : styles.horizontal}`}
			style={containerStyle}
		>
			<div className={styles.column} style={{ width: `${barWidth}px` }}>
				{shouldShowStat && (
					<div className={styles.percentageText}>{barHeight}%</div>
				)}
				<div className={`${styles.bar} ${styles.dropShadow}`} style={barStyle}>
					<div className={styles.numberOfSelections}>{selections}</div>
				</div>
			</div>
			<div className={`${styles.voteButtonContainer} ${styles.dropShadow}`}>
				<button
					onClick={handleVotePress}
					aria-label='Vote button'
					style={voteButtonStyle}
					className={`${styles.voteButton} ${isOptionSelected ? styles.selected : ''}`}
				>
					{isOptionSelected ? (
						<LikeIcon />
					) : (
						<HandIcon style={{ color: option.color }} />
					)}
				</button>
			</div>
			<button
				className={styles.infoIcon}
				aria-label='Info button'
				onClick={() => {
					setStatementInfo(option);
					setShowInfo(true);
				}}
			>
				<InfoIcon
					style={{ color: barHeight > 10 ? 'white' : '#6E8AA6' }}
				/>
			</button>
			<div className={`${styles.title} ${barWidth < 90 ? styles.isBarSmall : ''}`}>
				{shortVersion}
			</div>
		</div>
	);
};

export default OptionBar;
