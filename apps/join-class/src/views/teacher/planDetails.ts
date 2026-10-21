import m from 'mithril';
import { SIDE_NAME_MAX_LENGTH, isHttpsUrl, sideNamesOf } from '@/lib/classroom/classSettings';
import { getMainStatement } from '@/lib/store';
import { dropDraft, getDraft, getMainId, runSave, setDraft } from './planController';
import { saveLessonDetails } from './planApi';

/** The "lesson details" fields of the plan screen: opening video link and the
 *  two character names. Saved on blur like the other plan fields. */

export const VIDEO_KEY = 'lesson:video';
export const SIDE_A_KEY = 'lesson:sideA';
export const SIDE_B_KEY = 'lesson:sideB';
export const MAX_VIDEO_URL_LENGTH = 500;

const invalid = new Set<string>();

export const isInvalid = (key: string): boolean => invalid.has(key);

export function savedVideoUrl(): string {
	return getMainStatement()?.statementSettings?.videoUrl ?? '';
}

/** What is saved for a name; empty when the lesson uses the translated default. */
export function savedSideName(key: string): string {
	const own = getMainStatement()?.statementSettings?.sideNames;

	return (key === SIDE_A_KEY ? own?.a : own?.b) ?? '';
}

export function onDetailInput(key: string, value: string, max: number): void {
	setDraft(key, value.slice(0, max));
	invalid.delete(key);
}

export function commitVideoUrl(): void {
	const draft = getDraft(VIDEO_KEY);
	if (draft === undefined) return;
	const url = draft.trim();
	if (url === savedVideoUrl()) {
		dropDraft(VIDEO_KEY);
		invalid.delete(VIDEO_KEY);

		return;
	}
	if (url !== '' && !isHttpsUrl(url)) {
		invalid.add(VIDEO_KEY);
		m.redraw();

		return;
	}
	invalid.delete(VIDEO_KEY);
	setDraft(VIDEO_KEY, url);
	runSave(VIDEO_KEY, 'save video link', () => saveLessonDetails(getMainId(), { videoUrl: url }));
}

export function commitSideName(key: string): void {
	const draft = getDraft(key);
	if (draft === undefined) return;
	const name = draft.trim().slice(0, SIDE_NAME_MAX_LENGTH);
	if (name === savedSideName(key)) {
		dropDraft(key);

		return;
	}
	setDraft(key, name);
	// both names travel together (the schema keeps them as one object); the
	// other one keeps whatever is typed or saved, empty meaning "use the default"
	const other = key === SIDE_A_KEY ? SIDE_B_KEY : SIDE_A_KEY;
	const otherName = (getDraft(other) ?? savedSideName(other)).trim().slice(0, SIDE_NAME_MAX_LENGTH);
	const sideNames = key === SIDE_A_KEY ? { a: name, b: otherName } : { a: otherName, b: name };
	runSave(key, 'save side name', () => saveLessonDetails(getMainId(), { sideNames }));
}

/** Placeholder of a name field: the translated default the class will see. */
export function defaultSideName(key: string): string {
	const names = sideNamesOf(null);

	return key === SIDE_A_KEY ? names.a : names.b;
}
