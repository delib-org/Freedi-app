// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import m from 'mithril';
import { findMixedKeys } from './keyedLint';

describe('the keyed-fragment lint', () => {
	it('accepts all keyed and all unkeyed', () => {
		expect(findMixedKeys([m('i', { key: 1 }), m('i', { key: 2 })])).toEqual([]);
		expect(findMixedKeys([m('i'), 'text', null])).toEqual([]);
	});

	it('flags a keyed vnode beside a hole (null)', () => {
		const hole = (on: boolean): m.Children => [m('i', { key: 1 }), on ? m('b') : null];

		expect(findMixedKeys(hole(false))).toHaveLength(1);
	});

	it('flags a keyed vnode beside text and beside an unkeyed vnode', () => {
		expect(findMixedKeys([m('i', { key: 1 }), 'text'])).toHaveLength(1);
		expect(findMixedKeys([m('i', { key: 1 }), m('b')])).toHaveLength(1);
	});

	it('agrees with Mithril, which throws on exactly these', () => {
		const root = document.createElement('div');

		expect(() => m.render(root, [m('i', { key: 1 }), null])).toThrow();
		expect(() => m.render(root, [m('i', { key: 1 }), 'text'])).toThrow();
	});
});
