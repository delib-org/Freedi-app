// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('@/components/AccessibilityTool', () => ({ AccessibilityTool: { view: () => null } }));
vi.mock('@/lib/a11yPrefs', () => ({ isDarkTheme: () => false }));

import { Shell } from '../Shell';

let root: HTMLElement;

beforeEach(() => {
	root = document.createElement('div');
});

describe('Shell sign out', () => {
	it('draws a sign-out button on a host screen and calls the handler', () => {
		const onSignOut = vi.fn();

		m.render(root, m(Shell, { title: 'x', onSignOut }, null));
		const button = root.querySelector<HTMLButtonElement>('.shell__sign-out');

		expect(button).not.toBeNull();
		button?.click();
		expect(onSignOut).toHaveBeenCalledTimes(1);
	});

	it('draws none for participants, who pass no handler', () => {
		m.render(root, m(Shell, { phone: true }, null));

		expect(root.querySelector('.shell__sign-out')).toBeNull();
	});

	it('draws none on the projector screen', () => {
		m.render(root, m(Shell, { room: true, onSignOut: vi.fn() }, null));

		expect(root.querySelector('.shell__sign-out')).toBeNull();
	});
});
