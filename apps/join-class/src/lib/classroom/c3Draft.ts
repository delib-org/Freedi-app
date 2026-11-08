/**
 * Local drafts of the table write boxes (lane C3). A send that fails, or a
 * phone that reloads, must not lose what a student wrote (IA §9b): the text is
 * kept under Join's `freedi_joinclass_` prefix until it is sent.
 */

export const DRAFT_KEY_PREFIX = 'freedi_joinclass_c3_';

export type DraftKind = 'answer' | 'proposal';

export function draftKey(scopeId: string, kind: DraftKind): string {
	return `${DRAFT_KEY_PREFIX}${scopeId}_${kind}`;
}

export function readDraft(scopeId: string, kind: DraftKind): string {
	try {
		return localStorage.getItem(draftKey(scopeId, kind)) ?? '';
	} catch (error) {
		console.error('[C3] readDraft failed:', error);

		return '';
	}
}

export function writeDraft(scopeId: string, kind: DraftKind, text: string): void {
	try {
		if (text) localStorage.setItem(draftKey(scopeId, kind), text);
		else localStorage.removeItem(draftKey(scopeId, kind));
	} catch (error) {
		console.error('[C3] writeDraft failed:', error);
	}
}

export function clearDraft(scopeId: string, kind: DraftKind): void {
	writeDraft(scopeId, kind, '');
}
