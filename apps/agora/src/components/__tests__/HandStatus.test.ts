import { describe, expect, it, vi } from 'vitest';
import type m from 'mithril';
import { HandStatus, type HandStatusAttrs } from '../HandStatus';
import { t } from '../../lib/i18n';

const render = (attrs: HandStatusAttrs): string =>
	JSON.stringify(
		(HandStatus.view as (vnode: m.Vnode<HandStatusAttrs>) => m.Children)({
			attrs,
		} as m.Vnode<HandStatusAttrs>),
	);

describe('HandStatus', () => {
	const status = { ratedCount: 0, total: 0, finished: false };

	it('an empty hand still waiting never says "you have 0 notes"', () => {
		const text = render({ status, waiting: true, exhausted: false, onDrawMore: vi.fn() });
		expect(text).toContain(t('hand.waiting_none'));
		expect(text).not.toContain(t('hand.waiting', { n: 0 }));
	});

	it('a partial hand counts what is there', () => {
		const text = render({
			status: { ratedCount: 1, total: 3, finished: false },
			waiting: true,
			exhausted: false,
			onDrawMore: vi.fn(),
		});
		expect(text).toContain(t('hand.line', { n: 1, total: 3 }));
		expect(text).toContain(t('hand.waiting', { n: 3 }));
	});
});
