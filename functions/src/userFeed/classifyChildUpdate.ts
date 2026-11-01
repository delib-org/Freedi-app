import type { Statement } from '@freedi/shared-types';
import { getParagraphsText } from '../helpers';

export interface ChildUpdateClassification {
	titleChanged: boolean;
	descriptionChanged: boolean;
	beforeParagraphs: string;
	afterParagraphs: string;
	/**
	 * True when the edit is CONTENT that should refresh the parent's preview
	 * and raise the discussion on members' home pages.
	 *
	 * Consensus / evaluation counts / results are deliberately NOT activity:
	 * they reach open screens live through the statement listeners, and
	 * treating them as activity used to re-stamp up to 500 subscriptions per
	 * evaluation (each stamp waking three membership triggers).
	 */
	isContentActivity: boolean;
}

export function classifyChildUpdate(
	before: Statement,
	after: Statement,
): ChildUpdateClassification {
	const titleChanged = before.statement !== after.statement;
	const beforeParagraphs = getParagraphsText(before.paragraphs);
	const afterParagraphs = getParagraphsText(after.paragraphs);
	const descriptionChanged = beforeParagraphs !== afterParagraphs;

	return {
		titleChanged,
		descriptionChanged,
		beforeParagraphs,
		afterParagraphs,
		isContentActivity: titleChanged || descriptionChanged,
	};
}
