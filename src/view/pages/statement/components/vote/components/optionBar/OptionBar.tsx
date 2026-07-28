import { CSSProperties, FC, memo, useCallback } from 'react';

import InfoIcon from '@/assets/icons/infoCircleIcon.svg?react';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import { OptionBarProps } from '../../voteTypesHelper';
import styles from './OptionBar.module.scss';
import { getBarWidth, getBarPadding } from './OptionBarCont';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { getOptionColor } from '@/controllers/utils/colorUtils';

/**
 * Above this share of the vote the bar is dark enough to carry a white info
 * icon. Only relevant in the vertical layout, where the button still overlaps
 * the fill — the sided layout parks it past the percentage, clear of the bar.
 */
const WHITE_INFO_ICON_THRESHOLD = 10;

const OptionBarComponent: FC<OptionBarProps> = ({
	option,
	selections,
	isSelected,
	castVote,
	totalVotes,
	order,
	setStatementInfo,
	setShowInfo,
	isVertical,
	optionsCount,
	screenWidth,
}) => {
	// * Variables * //
	const _optionOrder = option.order || 0;
	const optionColor = getOptionColor(option);

	const barWidth = getBarWidth({
		isVertical,
		totalOptionsCount: optionsCount,
		screenWidth,
	});
	const padding = getBarPadding(isVertical);
	const barThickness = barWidth - padding;
	const { shortVersion } = statementTitleToDisplay(option.statement, 30);
	const barHeight =
		selections > 0 && totalVotes > 0 ? Math.round((selections / totalVotes) * 100) : 0;

	const handleVotePress = useCallback(() => {
		castVote(option);
	}, [castVote, option]);

	const containerInset = `${(_optionOrder - order) * barWidth}px`;
	const containerStyle = {
		[isVertical ? 'right' : 'left']: containerInset,
		width: `${barWidth}px`,
		// Drives the sided layout's rounding and count badge, which have to
		// follow the bar's real thickness.
		'--bar-thickness': `${barThickness}px`,
	} as CSSProperties;

	const voteButtonStyle = {
		width: `${barThickness}px`,
		// Unvoted buttons wear a wash of the bar's own colour rather than plain
		// white, so button and bar read as one object.
		backgroundColor: isSelected ? optionColor : `color-mix(in srgb, ${optionColor} 16%, white)`,
	};

	const barStyle = {
		height: `${barHeight}%`,
		width: `${barThickness}px`,
		backgroundColor: optionColor,
	};

	const shouldShowStat = barHeight > 0;

	const infoButton = (
		<button
			className={styles.infoIcon}
			aria-label="Info button"
			onClick={() => {
				setStatementInfo(option);
				setShowInfo(true);
			}}
		>
			<InfoIcon
				style={isVertical && barHeight > WHITE_INFO_ICON_THRESHOLD ? { color: 'white' } : undefined}
			/>
		</button>
	);

	return (
		<div
			className={`${styles.optionBar} ${isVertical ? styles.vertical : styles.horizontal}`}
			style={containerStyle}
		>
			<div className={styles.column} style={{ width: `${barWidth}px` }}>
				{/*
				 * Sided layout only: in the flow of the bottom-packed column, so the
				 * button trails the bar and its percentage however long the bar is.
				 * It must NOT go here in the vertical layout — .column carries a
				 * filter, which makes it the containing block for absolutely
				 * positioned children, so vertical's `bottom: 70px` would silently
				 * start measuring from the column instead of the whole bar.
				 */}
				{!isVertical && infoButton}
				{shouldShowStat && <div className={styles.percentageText}>{barHeight}%</div>}
				<div className={`${styles.bar} ${styles.dropShadow}`} style={barStyle}>
					<div className={styles.numberOfSelections}>{selections}</div>
				</div>
			</div>
			<div className={`${styles.voteButtonContainer} ${styles.dropShadow}`}>
				<button
					onClick={handleVotePress}
					aria-label="Vote button"
					aria-pressed={isSelected}
					style={voteButtonStyle}
					className={`${styles.voteButton} ${isSelected ? styles.selected : ''}`}
				>
					{isSelected ? <LikeIcon /> : <HandIcon style={{ color: optionColor }} />}
				</button>
			</div>
			{isVertical && infoButton}
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
		prevProps.option.statement === nextProps.option.statement &&
		prevProps.option.order === nextProps.option.order &&
		prevProps.option.color === nextProps.option.color &&
		prevProps.selections === nextProps.selections &&
		prevProps.isSelected === nextProps.isSelected &&
		prevProps.castVote === nextProps.castVote &&
		prevProps.totalVotes === nextProps.totalVotes &&
		prevProps.order === nextProps.order &&
		prevProps.isVertical === nextProps.isVertical &&
		prevProps.optionsCount === nextProps.optionsCount &&
		prevProps.screenWidth === nextProps.screenWidth
	);
});

export default OptionBar;
