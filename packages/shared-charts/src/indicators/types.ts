import type { ChartSpec } from '../types';

export type IndicatorScope = 'class' | 'student' | 'teacher' | 'school' | 'system';

/** Grid span hint: a KPI tile is `sm`, a half-width chart `md`, a full row `lg`. */
export type IndicatorSize = 'sm' | 'md' | 'lg';

export type IndicatorOutput =
	/** KPI tile */
	| { type: 'stat'; value: number | string; unit?: string; hint?: string }
	/** A chart; `hint` is a one-line caption under it (e.g. "3 of 5") */
	| { type: 'chart'; spec: ChartSpec; height?: number; legend?: boolean; hint?: string }
	/** Nothing to show yet — `reasonKey` is an i18n key suffix (`indicator.empty.<reasonKey>`) */
	| { type: 'empty'; reasonKey: string };

/** The app's i18n, handed in so the package never owns a dictionary. */
export interface IndicatorLabels {
	t(key: string, params?: Record<string, string>): string;
	/** BCP-47 tag used for bucket labels inside chart specs (default `en`). */
	locale?: string;
}

export interface Indicator<Ctx> {
	/** Stable id: the i18n key suffix (`indicator.<id>`) and the handle for hiding/reordering. */
	id: string;
	scope: IndicatorScope;
	size: IndicatorSize;
	/**
	 * Every i18n key this indicator reads (title + legend/category/empty keys),
	 * listed so translators can add them to each app's dictionary.
	 */
	labelKeys: string[];
	build(ctx: Ctx, labels: IndicatorLabels): IndicatorOutput;
}

export interface ResolveOptions {
	/** Indicator ids to leave out. */
	hide?: string[];
	/** Ids in display order; ids not listed keep their registry order after the listed ones. */
	order?: string[];
}
