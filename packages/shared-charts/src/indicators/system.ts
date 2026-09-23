import type { Indicator } from './types';
import type { DayPoint, SystemIndicatorContext } from './contexts';
import { formatBucketKey } from '../format';
import type { Series, Slot } from '../types';
import { OUTCOME_KEYS, OUTCOME_ORDER, emptyOutput, stat } from './shared';

type SystemIndicator = Indicator<SystemIndicatorContext>;

const gamesFinished: SystemIndicator = {
	id: 'system.gamesFinished',
	scope: 'system',
	size: 'sm',
	labelKeys: ['indicator.system.gamesFinished'],
	build: (ctx) => stat(ctx.totals.gamesFinished),
};

const studentsReached: SystemIndicator = {
	id: 'system.studentsReached',
	scope: 'system',
	size: 'sm',
	labelKeys: ['indicator.system.studentsReached'],
	build: (ctx) => stat(ctx.totals.studentsReached),
};

const classesPlayed: SystemIndicator = {
	id: 'system.classesPlayed',
	scope: 'system',
	size: 'sm',
	labelKeys: ['indicator.system.classesPlayed'],
	build: (ctx) => stat(ctx.totals.classesPlayed),
};

const teachersActive: SystemIndicator = {
	id: 'system.teachersActive',
	scope: 'system',
	size: 'sm',
	labelKeys: ['indicator.system.teachersActive'],
	build: (ctx) => stat(ctx.teachersActive),
};

function dailyBars(
	id: string,
	seriesKey: string,
	slot: Slot,
	pick: (ctx: SystemIndicatorContext) => DayPoint[],
): SystemIndicator {
	return {
		id,
		scope: 'system',
		size: 'md',
		labelKeys: [`indicator.${id}`, seriesKey, 'indicator.empty.noActivityYet'],
		build: (ctx, labels) => {
			const points = pick(ctx);
			if (points.length === 0) return emptyOutput('noActivityYet');

			return {
				type: 'chart',
				spec: {
					kind: 'bars',
					keys: points.map((p) => p.day),
					granularity: 'day',
					series: [{ id, label: labels.t(seriesKey), values: points.map((p) => p.value), slot }],
				},
			};
		},
	};
}

const gamesFinishedByDay = dailyBars('system.gamesFinishedByDay', 'indicator.series.games', 1, (ctx) => ctx.gamesFinishedByDay);
const studentsReachedByDay = dailyBars('system.studentsReachedByDay', 'indicator.series.students', 3, (ctx) => ctx.studentsReachedByDay);
const classesPlayedByDay = dailyBars('system.classesPlayedByDay', 'indicator.series.classes', 2, (ctx) => ctx.classesPlayedByDay);

const outcomesPerWeek: SystemIndicator = {
	id: 'system.outcomesPerWeek',
	scope: 'system',
	size: 'lg',
	labelKeys: ['indicator.system.outcomesPerWeek', ...OUTCOME_KEYS, 'indicator.empty.noLessonsYet'],
	build: (ctx, labels) => {
		const weeks = Array.from(
			new Set(OUTCOME_ORDER.flatMap((o) => (ctx.byOutcomeWeekly[o.key] ?? []).map((p) => p.weekStart))),
		).sort();
		if (weeks.length === 0) return emptyOutput('noLessonsYet');
		const locale = labels.locale ?? 'en';
		const series: Series[] = OUTCOME_ORDER.map((o) => {
			const byWeek = new Map((ctx.byOutcomeWeekly[o.key] ?? []).map((p) => [p.weekStart, p.value]));

			return {
				id: o.key,
				label: labels.t(`indicator.outcome.${o.key}`),
				values: weeks.map((w) => byWeek.get(w) ?? 0),
				// The strip's "unscored" is muted; a stacked column needs a real slot.
				slot: o.slot === 'muted' ? 6 : o.slot,
			};
		});

		return {
			type: 'chart',
			legend: true,
			spec: { kind: 'stackedBars', categories: weeks.map((w) => formatBucketKey(w, 'week', locale)), series },
		};
	},
};

export const SYSTEM_INDICATORS: SystemIndicator[] = [
	gamesFinished,
	studentsReached,
	classesPlayed,
	teachersActive,
	gamesFinishedByDay,
	studentsReachedByDay,
	classesPlayedByDay,
	outcomesPerWeek,
];
