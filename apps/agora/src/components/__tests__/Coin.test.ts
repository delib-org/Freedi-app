import { describe, it, expect } from 'vitest';
import type m from 'mithril';
import { Coin, type CoinAttrs } from '../Coin';

function render(attrs: CoinAttrs = {}): m.Vnode {
	return Coin().view({ attrs } as m.Vnode<CoinAttrs>) as m.Vnode;
}

describe('Coin', () => {
	it('draws the ₪ coin at the asked size, hidden from screen readers', () => {
		const svg = render({ size: 28 });
		const attrs = svg.attrs as Record<string, unknown>;

		expect(attrs.width).toBe(28);
		expect(attrs['aria-hidden']).toBe('true');
	});

	it('gives every coin its own gradient ids', () => {
		const idsOf = (svg: m.Vnode): string[] => {
			const defs = (svg.children as m.Vnode[])[0];

			return (defs.children as m.Vnode[]).map((g) => String((g.attrs as { id: string }).id));
		};
		const first = idsOf(render());
		const second = idsOf(render());

		expect(first.some((id) => second.includes(id))).toBe(false);
	});
});
