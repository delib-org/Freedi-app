import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ShownCampSupport, ShownSupportBySide } from '@freedi/shared-types';
import { draw } from '../../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

const { SupportBySide } = await import('../SupportBySide');

/**
 * Decision B (Trello btMVQMM5): a camp with fewer than 3 members or raters
 * arrives from the server as { hidden: true } only, with no mean and no size. Its row says "too few to show" where the bar
 * would be; the other rows keep their bars; nothing breaks with 1, 2 or 3 hidden.
 */

const shown = (mean: number, n: number, withCounts = false): ShownCampSupport => ({
	hidden: false,
	mean,
	counts: withCounts ? { n, m: n } : null,
});
const hidden = (): ShownCampSupport => ({ hidden: true });

function render(result: ShownSupportBySide): ReturnType<typeof draw> {
	const view = SupportBySide.view as unknown as (v: unknown) => m.Vnode;

	return draw(view({ attrs: { result, gate: 0.6, names: { a: 'A', b: 'B' } } }));
}

function countOf(list: readonly string[], item: string): number {
	return list.filter((x) => x === item).length;
}

describe('support by side with small camps hidden', () => {
	it.each([
		['one', { a: shown(1, 4), center: hidden(), b: shown(0.5, 3) }, 1],
		['two', { a: hidden(), center: hidden(), b: shown(0.5, 3) }, 2],
		['all three', { a: hidden(), center: hidden(), b: hidden() }, 3],
	] as const)(
		'%s hidden: that many "too few" lines and the rest as bars',
		(_label, camps, hiddenCount) => {
			const drawn = render({ ...camps, verdict: 'insufficient' });
			expect(countOf(drawn.text, 'summary.too_few')).toBe(hiddenCount);
			expect(countOf(drawn.classes, 'support__too-few')).toBe(hiddenCount);
			expect(countOf(drawn.classes, 'support__track')).toBe(3 - hiddenCount);
			expect(countOf(drawn.classes, 'support__row')).toBe(3);
			// a hidden camp has no numbers, and with a camp hidden no count is sent at all
			expect(countOf(drawn.classes, 'support__count')).toBe(0);
			expect(drawn.text.some((x) => x.startsWith('summary.n_of_m'))).toBe(false);
		},
	);

	it('no camp hidden: three bars with their counts, no "too few"', () => {
		const drawn = render({
			a: shown(1, 3, true),
			center: shown(0, 3, true),
			b: shown(0.8, 5, true),
			verdict: 'closer',
		});
		expect(drawn.text).not.toContain('summary.too_few');
		expect(countOf(drawn.classes, 'support__track')).toBe(3);
		expect(countOf(drawn.classes, 'support__count')).toBe(3);
	});
});
