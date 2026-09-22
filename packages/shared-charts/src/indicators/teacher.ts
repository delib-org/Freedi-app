import type { Indicator } from './types';
import type { TeacherIndicatorContext } from './contexts';
import { formatMinutes } from '../format';
import { emptyOutput, round1, stat, weekSeries } from './shared';

type TeacherIndicator = Indicator<TeacherIndicatorContext>;

const MS_PER_MINUTE = 60_000;

const lessons: TeacherIndicator = {
	id: 'teacher.lessons',
	scope: 'teacher',
	size: 'sm',
	labelKeys: ['indicator.teacher.lessons'],
	build: (ctx) => stat(ctx.lessonsRun),
};

const activeTime: TeacherIndicator = {
	id: 'teacher.activeTime',
	scope: 'teacher',
	size: 'sm',
	labelKeys: ['indicator.teacher.activeTime', 'indicator.format.hoursMinutes'],
	build: (ctx, labels) => {
		const { h, m } = formatMinutes(ctx.totalDurationMs);

		return stat(labels.t('indicator.format.hoursMinutes', { h: String(h), m: String(m) }));
	},
};

const classes: TeacherIndicator = {
	id: 'teacher.classes',
	scope: 'teacher',
	size: 'sm',
	labelKeys: ['indicator.teacher.classes'],
	build: (ctx) => stat(ctx.classCount),
};

const avgScore: TeacherIndicator = {
	id: 'teacher.avgScore',
	scope: 'teacher',
	size: 'sm',
	labelKeys: ['indicator.teacher.avgScore', 'indicator.empty.noScoredLessons'],
	build: (ctx) => (ctx.avgClassScore === null ? emptyOutput('noScoredLessons') : stat(round1(ctx.avgClassScore))),
};

const activeMinutes: TeacherIndicator = {
	id: 'teacher.activeMinutes',
	scope: 'teacher',
	size: 'md',
	labelKeys: ['indicator.teacher.activeMinutes', 'indicator.series.minutes', 'indicator.empty.noActivityYet'],
	build: (ctx, labels) => {
		const label = labels.t('indicator.series.minutes');
		const points =
			ctx.granularity === 'day'
				? ctx.usageDays.map((d) => ({ key: d.day, value: d.activeMs }))
				: ctx.usageWeeks.map((w) => ({ key: w.weekStart, value: w.value }));
		if (points.length === 0) return emptyOutput('noActivityYet');

		return {
			type: 'chart',
			spec: {
				kind: 'bars',
				keys: points.map((p) => p.key),
				granularity: ctx.granularity,
				series: [{ id: 'minutes', label, values: points.map((p) => Math.round(p.value / MS_PER_MINUTE)), slot: 2 }],
				unit: 'min',
			},
		};
	},
};

const lessonsPerWeek: TeacherIndicator = {
	id: 'teacher.lessonsPerWeek',
	scope: 'teacher',
	size: 'md',
	labelKeys: ['indicator.teacher.lessonsPerWeek', 'indicator.series.lessons', 'indicator.empty.noLessonsYet'],
	build: (ctx, labels) => {
		if (ctx.lessonsByWeek.length === 0) return emptyOutput('noLessonsYet');

		return {
			type: 'chart',
			spec: { kind: 'bars', granularity: 'week', ...weekSeries('lessons', labels.t('indicator.series.lessons'), ctx.lessonsByWeek, 1) },
		};
	},
};

const scoreTrend: TeacherIndicator = {
	id: 'teacher.scoreTrend',
	scope: 'teacher',
	size: 'md',
	labelKeys: ['indicator.teacher.scoreTrend', 'indicator.series.classScore', 'indicator.empty.noScoredLessons'],
	build: (ctx, labels) => {
		const scored = ctx.scoreByWeek.filter((w): w is { weekStart: string; value: number } => w.value !== null);
		if (scored.length === 0) return emptyOutput('noScoredLessons');

		return {
			type: 'chart',
			spec: {
				kind: 'line',
				granularity: 'week',
				yDomainFrom: 'zero',
				...weekSeries('classScore', labels.t('indicator.series.classScore'), scored, 1),
			},
		};
	},
};

export const TEACHER_INDICATORS: TeacherIndicator[] = [lessons, activeTime, classes, avgScore, activeMinutes, lessonsPerWeek, scoreTrend];
