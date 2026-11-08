import { speakSecondsOf } from '@freedi/shared-types';
import type { ClassTable, LessonSettingsHolder } from '@freedi/shared-types';

/**
 * How long a speaking time is, as the clocks draw it (IA 25.5). One setting for
 * answers and proposals: `speakSeconds` on the lesson. A minute that is running
 * (or just ended) keeps the length the server wrote with it (`speakerMs`), so a
 * live change of the setting never distorts it; an idle clock shows the setting
 * the next speaker will get.
 */

const MS_PER_SECOND = 1000;

/** The speaking time the next speaker gets, in ms. */
export function lessonSpeakMs(main: LessonSettingsHolder | null | undefined): number {
	return speakSecondsOf(main) * MS_PER_SECOND;
}

/** The length of the table's current speaking time: its own `speakerMs`, else the lesson setting. */
export function tableSpeakMs(
	table: Pick<ClassTable, 'speakerMs'>,
	main: LessonSettingsHolder | null | undefined,
): number {
	return typeof table.speakerMs === 'number' && table.speakerMs > 0
		? table.speakerMs
		: lessonSpeakMs(main);
}
