import { useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { IndicatorLabels } from '@freedi/shared-charts';

/**
 * The indicator registry in `@freedi/shared-charts` asks for dotted keys
 * (`indicator.class.scorePerLesson`). Studio's dictionaries are keyed by
 * English sentences, so this table maps each dotted key to the sentence the
 * dictionaries know. A key missing here falls through as-is, which shows up
 * in the UI as a dotted string — the test in `__tests__/indicatorLabels`
 * keeps the table complete for every scope.
 */
export const INDICATOR_KEYS: Record<string, string> = {
	// class
	'indicator.class.lessons': 'Lessons',
	'indicator.class.avgScore': 'Average class score',
	'indicator.class.successRate': 'Success rate',
	'indicator.class.scorePerLesson': 'Class score per lesson',
	'indicator.class.participation': 'Participation',
	'indicator.class.contributionByStudent': 'Contribution by student',
	'indicator.class.pointsDistribution': 'Points distribution',
	// student
	'indicator.student.points': 'Points',
	'indicator.student.avgPerGame': 'Average points per lesson',
	'indicator.student.bestGame': 'Best lesson',
	'indicator.student.pointsPerGame': 'Points per lesson',
	'indicator.student.contributionMix': 'Contribution mix',
	'indicator.student.attendance': 'Attendance',
	'indicator.student.attendance.played': 'Attended',
	'indicator.student.attendance.missed': 'Not attended',
	'indicator.student.attendance.hint': '{{played}} of {{total}} lessons',
	// teacher
	'indicator.teacher.lessons': 'Lessons',
	'indicator.teacher.activeTime': 'Active screen time',
	'indicator.teacher.classes': 'Classes',
	'indicator.teacher.avgScore': 'Average class score',
	'indicator.teacher.activeMinutes': 'Active minutes',
	'indicator.teacher.lessonsPerWeek': 'Lessons per week',
	'indicator.teacher.scoreTrend': 'Score trend',
	// school
	'indicator.school.teachers': 'Teachers',
	'indicator.school.classes': 'Classes',
	'indicator.school.lessons': 'Lessons',
	'indicator.school.studentGameSlots': 'Student participations',
	'indicator.school.outcomes': 'Lesson outcomes',
	'indicator.school.lessonsPerWeek': 'Lessons per week',
	'indicator.school.classComparison': 'Class comparison',
	// system
	'indicator.system.gamesFinished': 'Games finished',
	'indicator.system.studentsReached': 'Students reached',
	'indicator.system.classesPlayed': 'Classes played',
	'indicator.system.teachersActive': 'Active teachers',
	'indicator.system.gamesFinishedByDay': 'Games finished per day',
	'indicator.system.studentsReachedByDay': 'Students reached per day',
	'indicator.system.classesPlayedByDay': 'Classes played per day',
	'indicator.system.outcomesPerWeek': 'Outcomes per week',
	// categories
	'indicator.category.proposals': 'Proposals',
	'indicator.category.helping': 'Helping',
	'indicator.category.rating': 'Rating',
	'indicator.category.revising': 'Revising',
	'indicator.category.appreciation': 'Appreciation',
	// outcomes
	'indicator.outcome.success': 'Success',
	'indicator.outcome.honestDisagreement': 'Honest disagreement',
	'indicator.outcome.collapse': 'No agreement',
	'indicator.outcome.unscored': 'Unscored',
	// empty reasons
	'indicator.empty.noScoredLessons': 'No scored lessons yet',
	'indicator.empty.noLessonsYet': 'No lessons yet',
	'indicator.empty.noMembers': 'No students yet',
	'indicator.empty.noPointsYet': 'No points yet',
	'indicator.empty.noGamesYet': 'No lessons yet',
	'indicator.empty.noActivityYet': 'No activity yet',
	'indicator.empty.noClasses': 'No classes yet',
	'indicator.empty.noScoreYet': 'No score yet',
	// misc
	'indicator.stat.median': 'Median',
	'indicator.format.hoursMinutes': '{{h}} h {{m}} min',
	'indicator.format.hoursOnly': '{{h}} h',
	'indicator.format.minutesOnly': '{{m}} min',
	'indicator.series.minutes': 'Minutes',
	'indicator.series.lessons': 'Lessons',
	'indicator.series.classScore': 'Class score',
	'indicator.series.points': 'Points',
	'indicator.series.participation': 'Participation',
	'indicator.series.games': 'Games finished',
	'indicator.series.students': 'Students',
	'indicator.series.classes': 'Classes',
};

/** The dictionary sentence for a dotted indicator key (the key itself when unmapped). */
export function indicatorSentence(key: string): string {
	return INDICATOR_KEYS[key] ?? key;
}

/** `IndicatorLabels` for the registry, backed by Studio's dictionaries. */
export function useIndicatorLabels(): IndicatorLabels {
	const { tWithParams, currentLanguage } = useTranslation();

	return useMemo(
		() => ({
			t: (key: string, params?: Record<string, string>) =>
				tWithParams(indicatorSentence(key), params ?? {}),
			locale: currentLanguage,
		}),
		[tWithParams, currentLanguage],
	);
}
