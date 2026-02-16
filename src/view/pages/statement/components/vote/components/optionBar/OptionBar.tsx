import { FC, useState, useEffect, memo, useCallback } from 'react';

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
import { setVoteToDB } from '@/controllers/db/vote/setVote';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { parentVoteSelector, setVoteToStore } from '@/redux/vote/votesSlice';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

const OptionBarComponent: FC<OptionBarProps> = ({
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

	// * Optimistic UI State * //
	const [isVotePending, setIsVotePending] = useState(false);
	const [optimisticVoteId, setOptimisticVoteId] = useState(vote?.statementId);

	useEffect(() => {
		setOptimisticVoteId(vote?.statementId);
		setIsVotePending(false);
	}, [vote]);

	// * Variables * //
	const _optionOrder = option.order || 0;
	// Calculate optimistic selections based on current and optimistic vote state
	const baseSelections: number = getSelections(statement, option);
	const selections = (() => {
		if (!isVotePending) return baseSelections;

		// If we're switching to this option
		if (optimisticVoteId === option.statementId && vote?.statementId !== option.statementId) {
			return baseSelections + 1;
		}
		// If we're switching away from this option
		if (vote?.statementId === option.statementId && optimisticVoteId !== option.statementId) {
			return Math.max(0, baseSelections - 1);
		}

		return baseSelections;
	})();

	const barWidth = getBarWidth({
		isVertical,
		totalOptionsCount: optionsCount,
		screenWidth,
	});
	const padding = 40;
	const { shortVersion } = statementTitleToDisplay(option.statement, 30);
	const barHeight =
		selections > 0 && totalVotes > 0 ? Math.round((selections / totalVotes) * 100) : 0;
	const handleVotePress = useCallback(async () => {
		// Optimistic update - immediately update UI
		const newVoteId = optimisticVoteId === option.statementId ? 'none' : option.statementId;

		setOptimisticVoteId(newVoteId);
		setIsVotePending(true);

		// Update store optimistically
		dispatch(setVoteToStore(option));

		// Database operation in background (removed redundant getStatementFromDB - listener handles updates)
		try {
			await setVoteToDB(option, creator);
		} finally {
			setIsVotePending(false);
		}
	}, [optimisticVoteId, option, dispatch, creator]);

	const isOptionSelected = optimisticVoteId === option.statementId;

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
				{shouldShowStat && <div className={styles.percentageText}>{barHeight}%</div>}
				<div className={`${styles.bar} ${styles.dropShadow}`} style={barStyle}>
					<div className={styles.numberOfSelections}>{selections}</div>
				</div>
			</div>
			<div className={`${styles.voteButtonContainer} ${styles.dropShadow}`}>
				<button
					onClick={handleVotePress}
					aria-label="Vote button"
					style={voteButtonStyle}
					className={`${styles.voteButton} ${isOptionSelected ? styles.selected : ''} ${isVotePending ? styles.pending : ''}`}
					disabled={isVotePending}
				>
					{isOptionSelected ? <LikeIcon /> : <HandIcon style={{ color: option.color }} />}
				</button>
			</div>
			<button
				className={styles.infoIcon}
				aria-label="Info button"
				onClick={() => {
					setStatementInfo(option);
					setShowInfo(true);
				}}
			>
				<InfoIcon style={{ color: barHeight > 10 ? 'white' : '#6E8AA6' }} />
			</button>
			<div className={`${styles.title} ${barWidth < 90 ? styles.isBarSmall : ''}`}>
				{shortVersion}
			</div>
		</div>
	);
};

// Memoize to prevent unnecessary re-renders when parent updates
export const OptionBar = memo(OptionBarComponent, (prevProps, nextProps) => {
	// Custom comparison - only re-render when relevant props change
	return (
		prevProps.option.statementId === nextProps.option.statementId &&
		prevProps.option.selections === nextProps.option.selections &&
		prevProps.option.color === nextProps.option.color &&
		prevProps.totalVotes === nextProps.totalVotes &&
		prevProps.order === nextProps.order &&
		prevProps.isVertical === nextProps.isVertical &&
		prevProps.optionsCount === nextProps.optionsCount &&
		prevProps.screenWidth === nextProps.screenWidth
	);
});

export default OptionBar;
