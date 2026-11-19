import m from 'mithril';
import { t } from '@/lib/i18n';
import { joinAll } from '@/lib/classroom/listNames';
import type { NextLine } from '@/lib/classroom/proposalsScreen';

/**
 * The "whose turn / what comes next" line of the Proposals screens (IA
 * join-class-proposals-flow §4). Always the same place, always plain words.
 */

/** The line as words: "Waiting for Noa and Avi", or null when there is nothing to say. */
export function nextLineText(
	next: NextLine | null,
	nameOf: (uid: string) => string,
	lang: string,
): string | null {
	if (!next) return null;

	return t(next.key, { names: joinAll(next.uids.map(nameOf), lang) });
}

/** The visible line; absent when there is nothing to say. */
export function nextLineView(text: string | null): m.Children {
	return text ? m('p.proposals-next', { 'data-testid': 'proposals-next' }, text) : null;
}
