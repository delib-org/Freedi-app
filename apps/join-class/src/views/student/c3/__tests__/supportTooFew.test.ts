import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ShownCampSupport, ShownSupportBySide } from '@freedi/shared-types';
import { draw } from '../../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

const { SupportBySide } = await import('../SupportBySide');

/**
 * Decision B (Trello btMVQMM5): a camp rated by fewer than 3 students arrives
 * from the server without a mean. Its row says "too few to show" where the bar
 * would be; the other rows keep their bars; nothing breaks with 1, 2 or 3 hidden.
 */

const shown = (mean: number, n: number): ShownCampSupport => ({ hidden: false, mean, n, m: n });
const hidden = (n: number): ShownCampSupport => ({ hidden: true, n, m: n });

function render(result: ShownSupportBySide): ReturnType<typeof draw> {
	const view = SupportBySide.view as unknown as (v: unknown) => m.Vnode;

	return draw(view({ attrs: { result, gate: 0.6, names: { a: 'A', b: 'B' } } }));
}

function countOf(list: readonly string[], item: string): number {
	return list.filter((x) => x === item).length;
}

describe('support by side with small camps hidden', () => {
	it.each([
		['one', { a: shown(1, 4), center: hidden(1), b: shown(0.5, 3) }, 1],
		['two', { a: hidden(2), center: hidden(0), b: shown(0.5, 3) }, 2],
		['all three', { a: hidden(2), center: hidden(1), b: hidden(2) }, 3],
	] as const)(
		'%s hidden: that many "too few" lines and the rest as bars',
		(_label, camps, hiddenCount) => {
			const drawn = render({ ...camps, verdict: 'insufficient' });
			expect(countOf(drawn.text, 'summary.too_few')).toBe(hiddenCount);
			expect(countOf(drawn.classes, 'support__too-few')).toBe(hiddenCount);
			expect(countOf(drawn.classes, 'support__track')).toBe(3 - hiddenCount);
			expect(countOf(drawn.classes, 'support__row')).toBe(3);
			expect(countOf(drawn.classes, 'support__count')).toBe(3);
		},
	);

	it('no camp hidden: three bars, no "too few"', () => {
		const drawn = render({
			a: shown(1, 3),
			center: shown(0, 3),
			b: shown(0.8, 5),
			verdict: 'closer',
		});
		expect(drawn.text).not.toContain('summary.too_few');
		expect(countOf(drawn.classes, 'support__track')).toBe(3);
	});
});
