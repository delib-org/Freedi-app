import { describe, it, expect } from 'vitest';
import type m from 'mithril';
import { Coin, COIN_STATE, COIN_VALUE, type CoinAttrs } from '../Coin';

function render(attrs: CoinAttrs = {}): m.Vnode {
	return Coin().view({ attrs } as m.Vnode<CoinAttrs>) as m.Vnode;
}

describe('Coin', () => {
	it('draws the obol at the asked size, hidden from screen readers', () => {
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

	it('strikes the fictional state and the value into the legend, and no real currency sign', () => {
		const text = JSON.stringify(render());

		expect(text).toContain(COIN_STATE);
		expect(text).toContain(COIN_VALUE);
		expect(text).not.toMatch(/₪|\$|€|£/);
	});

	it("points each legend line at its own coin's arc", () => {
		const svg = render();
		const ids = new Set(
			((svg.children as m.Vnode[])[0].children as m.Vnode[]).map(
				(d) => (d.attrs as { id: string }).id,
			),
		);
		const hrefs = (svg.children as m.Vnode[])
			.filter((c) => String(c.tag).startsWith('text'))
			.map((t) => ((t.children as m.Vnode[])[0].attrs as { href: string }).href.slice(1));

		expect(hrefs).toHaveLength(2);
		expect(hrefs.every((h) => ids.has(h))).toBe(true);
	});
});
