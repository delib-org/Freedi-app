import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { draw, textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/console-vote-order.scss', () => ({}));
vi.mock('@/styles/console-vote-bar.scss', () => ({}));

const { SupportAudienceSwitch } = await import('../ResultsAudienceSwitch');

interface RadioAttrs {
	value?: string;
	checked?: boolean;
	disabled?: boolean;
	onchange?: () => void;
}

function radios(node: m.Children): RadioAttrs[] {
	const found: RadioAttrs[] = [];
	const visit = (child: unknown): void => {
		if (Array.isArray(child)) child.forEach(visit);
		else if (child && typeof child === 'object' && 'tag' in child) {
			const vnode = child as m.Vnode;
			if (vnode.tag === 'input') found.push(vnode.attrs as RadioAttrs);
			if (typeof vnode.tag === 'object' && 'view' in vnode.tag) {
				visit((vnode.tag as m.Component).view.call(vnode.tag, vnode as never));
			}
			visit(vnode.children);
		}
	};
	visit(node);

	return found;
}

function switchView(
	resultsShown: boolean,
	supportShown: boolean,
	onChange: (shown: boolean) => void = () => undefined,
): m.Children {
	return m(SupportAudienceSwitch, { resultsShown, supportShown, disabled: false, onChange });
}

describe('SupportAudienceSwitch', () => {
	it('has its own label and group name, apart from the results switch', () => {
		const drawn = draw(switchView(true, false));

		expect(drawn.text).toContain('console.support_audience');
		expect(drawn.roles).toContain('radiogroup');
	});

	it('results open, support missing (the default): "Only me" checked, hint says how to share', () => {
		const view = switchView(true, false);

		expect(radios(view).map((r) => r.checked)).toEqual([true, false]);
		expect(textOf(view)).toContain('console.support_hint_closed');
	});

	it('results open, support shown: "The whole class" checked, no hint', () => {
		const view = switchView(true, true);

		expect(radios(view).map((r) => r.checked)).toEqual([false, true]);
		expect(textOf(view)).not.toContain('console.support_hint');
	});

	it('results closed always win: locked on "Only me" with the open-results-first hint', () => {
		const view = switchView(false, true);

		expect(radios(view).map((r) => r.checked)).toEqual([true, false]);
		expect(radios(view).every((r) => r.disabled)).toBe(true);
		expect(textOf(view)).toContain('console.support_hint_blocked');
	});

	it('choosing an option reports the value both ways, no confirm', () => {
		const onChange = vi.fn();
		const [me, whole] = radios(switchView(true, false, onChange));

		whole.onchange?.();
		me.onchange?.();

		expect(onChange.mock.calls).toEqual([[true], [false]]);
	});
});
