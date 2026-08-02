interface GetBarWidthParams {
	isVertical: boolean;
	totalOptionsCount: number;
	screenWidth: number;
}

/** Lane each option occupies, across the axis the bars are stacked on. */
export const getBarWidth = ({
	isVertical,
	totalOptionsCount,
	screenWidth,
}: GetBarWidthParams): number => {
	// The sided layout keeps one lane size everywhere. It used to inherit the
	// 96px desktop lane on wide screens and drop to 70px on phones, which is
	// where its controls got too cramped to hit.
	if (!isVertical) return 76;

	if (screenWidth > 500) return 96;
	if (totalOptionsCount >= 4) return 86;

	return 96;
};

/**
 * Gap left inside each lane. The sided layout gets a much smaller one: its lane
 * is already narrow, and the old 40px gap shrank the vote button to 30px - well
 * under a usable tap target.
 */
export const getBarPadding = (isVertical: boolean): number => (isVertical ? 40 : 18);
