export interface ImageSize {
	width: number;
	height: number;
}

/**
 * Scale a size down so its longest side is at most maxDimension.
 * Aspect ratio is kept; images that already fit are never upscaled.
 */
export function calculateTargetSize(
	width: number,
	height: number,
	maxDimension: number,
): ImageSize {
	const longest = Math.max(width, height);

	if (!(longest > maxDimension) || maxDimension <= 0) {
		return { width, height };
	}

	const scale = maxDimension / longest;

	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}
