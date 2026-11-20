/**
 * Text typed by a person (a question, a name) is dropped into a sentence of another direction:
 * an English question inside a Hebrew heading. Unicode isolates keep the two apart, so the
 * quote marks and the "?" stay where the sentence put them instead of jumping to the other end.
 * Works in plain text (a heading string, an aria-label), where a <bdi> element cannot go.
 */

const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

export function isolate(text: string): string {
	return `${FIRST_STRONG_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;
}
