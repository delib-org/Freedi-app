import type { LangCode } from '../i18n';
import { libraryStrings } from './strings';
import { libraryCoverStrings } from './stringsCover';
import { libraryDiscussionStrings } from './stringsDiscussion';
import { libraryFeedbackStrings } from './stringsFeedback';

/** Every scenario-library string of one language, for the main table to merge in one go */
export function libraryStringsFor(lang: LangCode): Record<string, string> {
	return {
		...libraryStrings[lang],
		...libraryFeedbackStrings[lang],
		...libraryCoverStrings[lang],
		...libraryDiscussionStrings[lang],
	};
}
