// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { SURFACE_ATTRIBUTE } from '../surface';
import { withSurface } from '../surfaceRoutes';

/**
 * The wiring of src/index.ts against Mithril's real router: the same table
 * shapes (a plain component, a resolver that loads its screen late), the real
 * `<html>` element and real history navigation.
 */

const Student: m.Component = { view: () => m('main.student') };
const Console: m.Component = { view: () => m('main.console') };
const Projector: m.Component = { view: () => m('main.projector') };

function lazy(component: m.Component): m.RouteResolver {
	return { onmatch: () => Promise.resolve(component) };
}

function surface(): string | null {
	return document.documentElement.getAttribute(SURFACE_ATTRIBUTE);
}

async function shows(selector: string): Promise<void> {
	await vi.waitFor(() => {
		m.redraw.sync();
		expect(document.querySelector(selector)).not.toBeNull();
	});
}

describe('withSurface on the real router', () => {
	let root: HTMLElement;

	beforeEach(() => {
		m.route.prefix = '';
		window.history.replaceState(null, '', '/m/lesson1');
		root = document.createElement('div');
		document.body.appendChild(root);
		m.route(
			root,
			'/',
			withSurface(
				{
					'/': Console,
					'/m/:mid': Student,
					'/t/:mid': lazy(Console),
					'/t/:mid/screen': lazy(Projector),
				},
				document.documentElement,
			),
		);
	});

	afterEach(() => {
		m.mount(root, null);
		root.remove();
		document.documentElement.removeAttribute(SURFACE_ATTRIBUTE);
	});

	it('sets the surface with the first screen and on every route change', async () => {
		await shows('main.student');
		expect(surface()).toBe('student');

		m.route.set('/t/lesson1');
		await shows('main.console');
		expect(surface()).toBe('teacher');
	});

	it('is the projector while "show here" is open and the teacher again after going back', async () => {
		m.route.set('/t/lesson1');
		await shows('main.console');

		// ProjectorMenu.showHere: a route change that remembers where it came from
		m.route.set('/t/lesson1/screen', {}, { state: { fromConsole: true } });
		await shows('main.projector');
		expect(surface()).toBe('projector');

		// ProjectorControls.leave (the button, Esc and leaving full screen): history.back()
		window.history.back();
		await shows('main.console');
		expect(surface()).toBe('teacher');
	});

	it('keeps the surface of the screen being left until the next one is drawn', async () => {
		m.route.set('/t/lesson1');
		await shows('main.console');

		m.route.set('/t/lesson1/screen');
		// the projector's chunk has not resolved yet: the console is still on screen
		expect(document.querySelector('main.console')).not.toBeNull();
		expect(surface()).toBe('teacher');

		await shows('main.projector');
		expect(surface()).toBe('projector');
	});
});
