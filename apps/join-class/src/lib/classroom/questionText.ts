import { Collections, type Statement } from '@freedi/shared-types';
import m from 'mithril';
import { db, doc, getDoc } from '../firebase';

const fetchedText = new Map<string, string>();
const requested = new Set<string>();

export function getFetchedQuestionTexts(): ReadonlyMap<string, string> {
	return fetchedText;
}

/** One `getDoc` per id; a failed read is forgotten so a later redraw retries. */
export function requestQuestionText(questionId: string): void {
	if (requested.has(questionId) || fetchedText.has(questionId)) return;
	requested.add(questionId);
	void getDoc(doc(db, Collections.statements, questionId))
		.then((snap) => {
			if (snap.exists()) {
				fetchedText.set(questionId, (snap.data() as Statement).statement ?? '');
				m.redraw();
			}
		})
		.catch((error: unknown) => {
			console.error('[questionText] fetch failed:', questionId, error);
			requested.delete(questionId);
		});
}
