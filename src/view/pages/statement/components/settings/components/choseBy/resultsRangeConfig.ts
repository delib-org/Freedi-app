import { ResultsBy } from '@freedi/shared-types';

/**
 * How the cutoff threshold is presented versus how it is stored.
 *
 * Consensus is stored as a fraction (-1…1) but read by humans as a percentage,
 * so the slider needs a conversion on the way in and out. The other metrics are
 * raw counts and pass through unchanged. Shared by the settings screen's
 * `ChoseBySettings` and the Top Answers admin panel so the two can never
 * disagree about what a given stored number means.
 */
export interface RangeConfig {
	min: number;
	max: number;
	step: number;
	suffix: string;
	/** Slider value → stored value. */
	convert: (displayValue: number) => number;
	/** Stored value → slider value. */
	reverse: (storedValue: number) => number;
}

export function getRangeConfig(resultsBy: ResultsBy): RangeConfig {
	switch (resultsBy) {
		case ResultsBy.consensus:
			return {
				min: -100,
				max: 100,
				step: 5,
				suffix: '%',
				convert: (v: number) => v / 100,
				reverse: (v: number) => v * 100,
			};
		case ResultsBy.mostLiked:
			return {
				min: 0,
				max: 100,
				step: 1,
				suffix: '',
				convert: (v: number) => v,
				reverse: (v: number) => v,
			};
		case ResultsBy.averageLikesDislikes:
			return {
				min: -100,
				max: 100,
				step: 1,
				suffix: '',
				convert: (v: number) => v,
				reverse: (v: number) => v,
			};
		default:
			return {
				min: -100,
				max: 100,
				step: 5,
				suffix: '%',
				convert: (v: number) => v / 100,
				reverse: (v: number) => v * 100,
			};
	}
}

/** Render a slider value with its metric's suffix (e.g. `55%` or `12`). */
export function formatRangeValue(config: RangeConfig, value: number): string {
	return config.suffix ? `${value}${config.suffix}` : String(value);
}

/**
 * Slider value to show for a stored threshold. Consensus values outside the
 * -1…1 fraction range are legacy percentages written before the conversion
 * existed; treat them as unset rather than sending the slider off-scale.
 */
export function toDisplayValue(
	config: RangeConfig,
	resultsBy: ResultsBy,
	storedValue: number,
): number {
	if (resultsBy === ResultsBy.consensus) {
		if (storedValue > 1 || storedValue < -1) return 0;

		return config.reverse(storedValue);
	}

	return storedValue;
}
