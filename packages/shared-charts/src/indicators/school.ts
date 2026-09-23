import type { Indicator } from './types';
import type { SchoolIndicatorContext } from './contexts';
import type { HBarRow } from '../types';
import { OUTCOME_KEYS, OUTCOME_ORDER, PERCENT, emptyOutput, stat, weekSeries } from './shared';

type SchoolIndicator = Indicator<SchoolIndicatorContext>;

const teachers: SchoolIndicator = {
	id: 'school.teachers',
	scope: 'school',
	size: 'sm',
	labelKeys: ['indicator.school.teachers'],
	build: (ctx) => stat(ctx.teacherCount),
};

const classes: SchoolIndicator = {
	id: 'school.classes',
	scope: 'school',
	size: 'sm',
	labelKeys: ['indicator.school.classes'],
	build: (ctx) => stat(ctx.classCount),
};

const lessons: SchoolIndicator = {
	id: 'school.lessons',
	scope: 'school',
	size: 'sm',
	labelKeys: ['indicator.school.lessons'],
	build: (ctx) => stat(ctx.lessonsInPeriod),
};

const studentGameSlots: SchoolIndicator = {
	id: 'school.studentGameSlots',
	scope: 'school',
	size: 'sm',
	labelKeys: ['indicator.school.studentGameSlots'],
	build: (ctx) => stat(ctx.studentGameSlots),
};

const outcomes: SchoolIndicator = {
	id: 'school.outcomes',
	scope: 'school',
	size: 'md',
	labelKeys: ['indicator.school.outcomes', ...OUTCOME_KEYS, 'indicator.empty.noLessonsYet'],
	build: (ctx, labels) => {
		const parts = OUTCOME_ORDER.map((o) => ({
			label: labels.t(`indicator.outcome.${o.key}`),
			value: ctx.outcomes[o.key] ?? 0,
			slot: o.slot,
			icon: o.icon,
		}));
		if (parts.every((p) => p.value <= 0)) return emptyOutput('noLessonsYet');

		return { type: 'chart', legend: true, spec: { kind: 'strip', parts } };
	},
};

const lessonsPerWeek: SchoolIndicator = {
	id: 'school.lessonsPerWeek',
	scope: 'school',
	size: 'md',
	labelKeys: ['indicator.school.lessonsPerWeek', 'indicator.series.lessons', 'indicator.empty.noLessonsYet'],
	build: (ctx, labels) => {
		if (ctx.lessonsByWeek.length === 0) return emptyOutput('noLessonsYet');

		return {
			type: 'chart',
			spec: { kind: 'bars', granularity: 'week', ...weekSeries('lessons', labels.t('indicator.series.lessons'), ctx.lessonsByWeek, 1) },
		};
	},
};

const classComparison: SchoolIndicator = {
	id: 'school.classComparison',
	scope: 'school',
	size: 'lg',
	labelKeys: ['indicator.school.classComparison', 'indicator.empty.noScoreYet', 'indicator.empty.noClasses'],
	build: (ctx, labels) => {
		if (ctx.classes.length === 0) return emptyOutput('noClasses');
		const rows: HBarRow[] = [...ctx.classes]
			.sort((a, b) => (b.avgClassScore ?? -1) - (a.avgClassScore ?? -1))
			.map((c) => ({
				label: c.label,
				value: c.avgClassScore,
				slot: 1,
				max: PERCENT,
				note: c.avgClassScore === null ? labels.t('indicator.empty.noScoreYet') : undefined,
			}));

		return { type: 'chart', spec: { kind: 'hbars', rows } };
	},
};

export const SCHOOL_INDICATORS: SchoolIndicator[] = [teachers, classes, lessons, studentGameSlots, outcomes, lessonsPerWeek, classComparison];
