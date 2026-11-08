import type { LessonStatus } from '@freedi/shared-types';

/**
 * Pure helpers of the teacher home: which words and which mark a lesson row
 * wears for its status (IA 13.6 / UX 13.D), and the name filter.
 */

export type ChipMark = 'not-started' | 'live' | 'paused' | 'open' | 'ended';

export interface StatusChip {
	mark: ChipMark;
	/** i18n key; `{{n}}` is the 1-based step, `{{total}}` the step count. */
	key: string;
}

/** A live lesson on step 0 has not started; paused keeps its step in the words. */
export function statusChipOf(status: LessonStatus, stepIndex: number): StatusChip {
	switch (status) {
		case 'paused':
			return { mark: 'paused', key: 'teacher.row.paused' };
		case 'open':
			return { mark: 'open', key: 'teacher.row.open_after' };
		case 'ended':
			return { mark: 'ended', key: 'teacher.row.ended' };
		default:
			return stepIndex > 0
				? { mark: 'live', key: 'lesson.step_of' }
				: { mark: 'not-started', key: 'teacher.row.not_started' };
	}
}

/** Case- and niqqud-insensitive name match (Hebrew points and Arabic marks are stripped). */
export function foldForSearch(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[֑-ׇً-ٟ]/g, '')
		.toLocaleLowerCase();
}

export function filterLessons<T extends { title: string }>(
	lessons: readonly T[],
	text: string,
): T[] {
	const needle = foldForSearch(text.trim());
	if (!needle) return [...lessons];

	return lessons.filter((lesson) => foldForSearch(lesson.title).includes(needle));
}
