import type { Indicator } from './types';
import type { ClassIndicatorContext } from './contexts';
import { dayKey } from '../format';
import { median } from '../histogram';
import type { Series } from '../types';
import { CATEGORY_KEYS, CONTRIBUTION_CATEGORIES, PERCENT, emptyOutput, pointsCategory, round1, stat } from './shared';

type ClassIndicator = Indicator<ClassIndicatorContext>;

const HISTOGRAM_BINS = 6;

const lessons: ClassIndicator = {
	id: 'class.lessons',
	scope: 'class',
	size: 'sm',
	labelKeys: ['indicator.class.lessons'],
	build: (ctx) => stat(ctx.aggregate?.gamesPlayed ?? 0),
};

const avgScore: ClassIndicator = {
	id: 'class.avgScore',
	scope: 'class',
	size: 'sm',
	labelKeys: ['indicator.class.avgScore', 'indicator.empty.noScoredLessons'],
	build: (ctx) => {
		const avg = ctx.aggregate?.avgClassScore ?? null;

		return avg === null ? emptyOutput('noScoredLessons') : stat(round1(avg));
	},
};

const successRate: ClassIndicator = {
	id: 'class.successRate',
	scope: 'class',
	size: 'sm',
	labelKeys: ['indicator.class.successRate', 'indicator.empty.noScoredLessons'],
	build: (ctx) => {
		const o = ctx.aggregate?.outcomes;
		const scored = o ? o.success + o.honestDisagreement + o.collapse : 0;
		if (!o || scored === 0) return emptyOutput('noScoredLessons');

		return stat(Math.round((o.success / scored) * PERCENT), '%');
	},
};

const scorePerLesson: ClassIndicator = {
	id: 'class.scorePerLesson',
	scope: 'class',
	size: 'md',
	labelKeys: ['indicator.class.scorePerLesson', 'indicator.series.classScore', 'indicator.empty.noScoredLessons'],
	build: (ctx, labels) => {
		const rows = (ctx.aggregate?.perGame ?? []).filter((r) => typeof r.classScoreTotal === 'number');
		if (rows.length === 0) return emptyOutput('noScoredLessons');

		return {
			type: 'chart',
			spec: {
				kind: 'line',
				keys: rows.map((r) => dayKey(r.playedAt)),
				granularity: 'day',
				series: [
					{
						id: 'classScore',
						label: labels.t('indicator.series.classScore'),
						values: rows.map((r) => r.classScoreTotal ?? 0),
						slot: 1,
					},
				],
			},
		};
	},
};

const participation: ClassIndicator = {
	id: 'class.participation',
	scope: 'class',
	size: 'md',
	labelKeys: ['indicator.class.participation', 'indicator.series.participation', 'indicator.empty.noLessonsYet', 'indicator.empty.noMembers'],
	build: (ctx, labels) => {
		const rows = ctx.aggregate?.perGame ?? [];
		if (rows.length === 0) return emptyOutput('noLessonsYet');
		if (ctx.memberCount <= 0) return emptyOutput('noMembers');

		return {
			type: 'chart',
			spec: {
				kind: 'bars',
				keys: rows.map((r) => dayKey(r.playedAt)),
				granularity: 'day',
				series: [
					{
						id: 'participation',
						label: labels.t('indicator.series.participation'),
						values: rows.map((r) => Math.min(PERCENT, Math.round((r.participantCount / ctx.memberCount) * PERCENT))),
						slot: 2,
					},
				],
				yMax: PERCENT,
				unit: '%',
			},
		};
	},
};

const contributionByStudent: ClassIndicator = {
	id: 'class.contributionByStudent',
	scope: 'class',
	size: 'lg',
	labelKeys: ['indicator.class.contributionByStudent', ...CATEGORY_KEYS, 'indicator.empty.noMembers'],
	build: (ctx, labels) => {
		if (ctx.members.length === 0) return emptyOutput('noMembers');
		const series: Series[] = CONTRIBUTION_CATEGORIES.map((c) => ({
			id: c.key,
			label: labels.t(`indicator.category.${c.key}`),
			values: ctx.members.map((m) => {
				const career = ctx.careers[m.memberId];

				return career ? pointsCategory(career.totals, c.key) : 0;
			}),
			slot: c.slot,
		}));

		return {
			type: 'chart',
			legend: true,
			spec: { kind: 'stackedBars', categories: ctx.members.map((m) => m.alias), series },
		};
	},
};

const pointsDistribution: ClassIndicator = {
	id: 'class.pointsDistribution',
	scope: 'class',
	size: 'md',
	labelKeys: ['indicator.class.pointsDistribution', 'indicator.stat.median', 'indicator.empty.noPointsYet'],
	build: (ctx, labels) => {
		const totals = ctx.members
			.map((m) => ctx.careers[m.memberId]?.totals.total)
			.filter((v): v is number => typeof v === 'number');
		if (totals.length === 0) return emptyOutput('noPointsYet');
		const mid = median(totals) ?? 0;

		return {
			type: 'chart',
			spec: {
				kind: 'histogram',
				values: totals,
				binCount: HISTOGRAM_BINS,
				highlightValue: mid,
				highlightLabel: labels.t('indicator.stat.median'),
			},
		};
	},
};

export const CLASS_INDICATORS: ClassIndicator[] = [
	lessons,
	avgScore,
	successRate,
	scorePerLesson,
	participation,
	contributionByStudent,
	pointsDistribution,
];
