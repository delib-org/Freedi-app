import type { AgoraPoints } from '@freedi/shared-types';
import type { Series, Slot, StripPart } from '../types';
import type { IndicatorLabels, IndicatorOutput } from './types';
import type { OutcomeKey, WeekPoint } from './contexts';

/** The five contribution categories, in slot order 1..5, shared by class and student charts. */
export const CONTRIBUTION_CATEGORIES: ReadonlyArray<{ key: keyof AgoraPoints; slot: Slot }> = [
	{ key: 'proposals', slot: 1 },
	{ key: 'helping', slot: 2 },
	{ key: 'rating', slot: 3 },
	{ key: 'revising', slot: 4 },
	{ key: 'appreciation', slot: 5 },
];

export const CATEGORY_KEYS: string[] = CONTRIBUTION_CATEGORIES.map((c) => `indicator.category.${c.key}`);

export const OUTCOME_ORDER: ReadonlyArray<{ key: OutcomeKey; slot: Slot | 'muted'; icon: string }> = [
	{ key: 'success', slot: 4, icon: '✓' },
	{ key: 'honestDisagreement', slot: 2, icon: '≈' },
	{ key: 'collapse', slot: 5, icon: '✕' },
	{ key: 'unscored', slot: 'muted', icon: '–' },
];

export const OUTCOME_KEYS: string[] = OUTCOME_ORDER.map((o) => `indicator.outcome.${o.key}`);

export const emptyOutput = (reasonKey: string): IndicatorOutput => ({ type: 'empty', reasonKey });

export const stat = (value: number | string, unit?: string, hint?: string): IndicatorOutput =>
	unit === undefined && hint === undefined ? { type: 'stat', value } : { type: 'stat', value, unit, hint };

export function pointsCategory(points: AgoraPoints, key: keyof AgoraPoints): number {
	return points[key] ?? 0;
}

export function contributionParts(points: AgoraPoints, labels: IndicatorLabels): StripPart[] {
	return CONTRIBUTION_CATEGORIES.map((c) => ({
		label: labels.t(`indicator.category.${c.key}`),
		value: pointsCategory(points, c.key),
		slot: c.slot,
	}));
}

export function weekSeries(id: string, label: string, points: WeekPoint[], slot: Slot): { keys: string[]; series: [Series] } {
	return {
		keys: points.map((p) => p.weekStart),
		series: [{ id, label, values: points.map((p) => p.value), slot }],
	};
}

const ONE_DECIMAL = 10;

export function round1(v: number): number {
	return Math.round(v * ONE_DECIMAL) / ONE_DECIMAL;
}

export const PERCENT = 100;
