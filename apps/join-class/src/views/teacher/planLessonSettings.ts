import m from 'mithril';
import { allowOwnQuestionsOf } from '@freedi/shared-types';
import { getMainStatement } from '@/lib/store';
import { dropDraft, getDraft, getMainId, isSaving, runSave, setDraft } from './planController';
import { saveLessonDetails } from './planApi';
import { OwnQuestionsSwitch } from './TableSettingsControls';

/**
 * The plan screen's table-talk settings (IA 25): saved on the main statement
 * the moment they change (a switch has no blur to wait for), through the same
 * save path and error line as the other plan fields. The draft keeps the
 * control where the teacher put it until the snapshot catches up.
 */

export const OWN_QUESTIONS_KEY = 'lesson:ownQuestions';

/** The switch as drawn: the teacher's pending choice, else what is saved. */
export function ownQuestionsOn(): boolean {
	const saved = allowOwnQuestionsOf(getMainStatement());
	const draft = getDraft(OWN_QUESTIONS_KEY);
	if (draft === undefined) return saved;
	if ((draft === 'on') === saved && !isSaving(OWN_QUESTIONS_KEY)) {
		dropDraft(OWN_QUESTIONS_KEY);

		return saved;
	}

	return draft === 'on';
}

export function commitOwnQuestions(on: boolean): void {
	setDraft(OWN_QUESTIONS_KEY, on ? 'on' : 'off');
	runSave(OWN_QUESTIONS_KEY, 'save own questions', () =>
		saveLessonDetails(getMainId(), { allowOwnQuestions: on }),
	);
}

/** The own-questions switch under the list of the tables' questions. */
export function ownQuestionsControl(questionCount: number): m.Children {
	return m(OwnQuestionsSwitch, {
		scope: 'plan',
		on: ownQuestionsOn(),
		showNoneWarning: questionCount === 0,
		onChange: commitOwnQuestions,
	});
}
