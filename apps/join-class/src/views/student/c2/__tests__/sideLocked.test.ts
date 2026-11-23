import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { draw } from '../../../__tests__/vnodeText';

/**
 * Decision C (Trello btMVQMM5): at the Side step of a locked lesson the side is
 * shown read-only with "sides were locked after the vote", and nothing is written.
 */

const state = vi.hoisted(() => ({
	classState: { mySide: { side: 80 }, sideLock: null as { lockedAt: number } | null },
	sliderAttrs: null as Record<string, unknown> | null,
	setMySide: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/student-c2.scss', () => ({}));
vi.mock('@/lib/lesson', () => ({ stepLabel: (key: string) => key }));
vi.mock('@/lib/classroom/classState', () => ({ classState: state.classState }));
vi.mock('@/lib/classroom/studentWrites', () => ({ setMySide: state.setMySide }));
vi.mock('@/components/StudentFrame', () => ({
	StudentFrame: {
		view: (vnode: { attrs: { action: m.Children }; children: m.Children }) => [
			vnode.attrs.action,
			vnode.children,
		],
	},
}));
vi.mock('@/components/SideSlider', () => ({
	SideSlider: {
		view: (vnode: { attrs: Record<string, unknown> }) => {
			state.sliderAttrs = vnode.attrs;

			return m('input.slider');
		},
	},
}));

const { SideView } = await import('../SideView');

const STEPS = ['waiting', 'side', 'vote'];
const main = {
	statementId: 'm',
	statementSettings: { lessonPlan: { steps: STEPS, stepIndex: 1 } },
} as unknown as Statement;

function render(): ReturnType<typeof draw> {
	const view = SideView as unknown as {
		oninit: (v: unknown) => void;
		view: (v: unknown) => m.Vnode;
	};
	const vnode = { attrs: { main }, state: {} };
	view.oninit(vnode);

	return draw(view.view(vnode));
}

describe('the Side step of a locked lesson', () => {
	beforeEach(() => {
		state.setMySide.mockClear();
		state.sliderAttrs = null;
	});

	it('shows the saved side read-only with the locked line, no button, no write', () => {
		state.classState.sideLock = { lockedAt: 1 };
		const drawn = render();
		expect(drawn.text).toContain('side.locked');
		expect(drawn.text).not.toContain('side.saved');
		expect(state.sliderAttrs).toMatchObject({ disabled: true, value: 80 });
		(state.sliderAttrs?.onInput as (v: number) => void)(10);
		expect(state.setMySide).not.toHaveBeenCalled();
	});

	it('an unlocked lesson keeps the live slider', () => {
		state.classState.sideLock = null;
		const drawn = render();
		expect(drawn.text).not.toContain('side.locked');
		expect(state.sliderAttrs).toMatchObject({ disabled: false });
	});
});
