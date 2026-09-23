import type { Indicator } from './types';
import type { StudentIndicatorContext } from './contexts';
import { dayKey } from '../format';
import { CATEGORY_KEYS, contributionParts, emptyOutput, round1, stat } from './shared';

type StudentIndicator = Indicator<StudentIndicatorContext>;

const points: StudentIndicator = {
	id: 'student.points',
	scope: 'student',
	size: 'sm',
	labelKeys: ['indicator.student.points'],
	build: (ctx) => stat(ctx.career?.totals.total ?? 0),
};

const avgPerGame: StudentIndicator = {
	id: 'student.avgPerGame',
	scope: 'student',
	size: 'sm',
	labelKeys: ['indicator.student.avgPerGame'],
	build: (ctx) => stat(round1(ctx.career?.avgPointsPerGame ?? 0)),
};

const bestGame: StudentIndicator = {
	id: 'student.bestGame',
	scope: 'student',
	size: 'sm',
	labelKeys: ['indicator.student.bestGame'],
	build: (ctx) => stat(ctx.career?.bestGameTotal ?? 0),
};

const pointsPerGame: StudentIndicator = {
	id: 'student.pointsPerGame',
	scope: 'student',
	size: 'md',
	labelKeys: ['indicator.student.pointsPerGame', 'indicator.series.points', 'indicator.empty.noGamesYet'],
	build: (ctx, labels) => {
		const rows = ctx.career?.perGame ?? [];
		if (rows.length === 0) return emptyOutput('noGamesYet');

		return {
			type: 'chart',
			spec: {
				kind: 'line',
				keys: rows.map((r) => dayKey(r.playedAt)),
				granularity: 'day',
				series: [{ id: 'points', label: labels.t('indicator.series.points'), values: rows.map((r) => r.points.total), slot: 1 }],
			},
		};
	},
};

const contributionMix: StudentIndicator = {
	id: 'student.contributionMix',
	scope: 'student',
	size: 'md',
	labelKeys: ['indicator.student.contributionMix', ...CATEGORY_KEYS, 'indicator.empty.noPointsYet'],
	build: (ctx, labels) => {
		if (!ctx.career) return emptyOutput('noPointsYet');
		const parts = contributionParts(ctx.career.totals, labels);
		if (parts.every((p) => p.value <= 0)) return emptyOutput('noPointsYet');

		return { type: 'chart', legend: true, spec: { kind: 'strip', parts } };
	},
};

const attendance: StudentIndicator = {
	id: 'student.attendance',
	scope: 'student',
	size: 'md',
	labelKeys: ['indicator.student.attendance', 'indicator.student.attendance.played', 'indicator.student.attendance.missed', 'indicator.student.attendance.hint', 'indicator.empty.noGamesYet'],
	build: (ctx, labels) => {
		if (ctx.classGames <= 0) return emptyOutput('noGamesYet');
		const played = Math.min(ctx.classGames, ctx.career?.gamesPlayed ?? 0);
		const missed = ctx.classGames - played;

		return {
			type: 'chart',
			legend: true,
			hint: labels.t('indicator.student.attendance.hint', { played: String(played), total: String(ctx.classGames) }),
			spec: {
				kind: 'strip',
				parts: [
					{ label: labels.t('indicator.student.attendance.played'), value: played, slot: 4 },
					{ label: labels.t('indicator.student.attendance.missed'), value: missed, slot: 'muted' },
				],
			},
		};
	},
};

export const STUDENT_INDICATORS: StudentIndicator[] = [points, avgPerGame, bestGame, pointsPerGame, contributionMix, attendance];
