import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type m from 'mithril';
import type { AgoraSession } from '@freedi/shared-types';

const ratings = vi.hoisted(() => ({ myRatings: {} as Record<string, { value: number }> }));
vi.mock('../../lib/proposals', () => ({
	getDeliberationState: () => ratings,
	rateStatement: vi.fn(),
}));
vi.mock('../../lib/improvementSignals', () => ({ noteReWeighed: vi.fn() }));
import { RateScale, rateAckKey, type RateScaleAttrs } from '../RateScale';
import { t } from '../../lib/i18n';

describe('rateAckKey', () => {
	it('thanks a first rating as saved, and only a change as "updated"', () => {
		expect(rateAckKey(undefined)).toBe('rate.saved_ack');
		expect(rateAckKey(0.5)).toBe('delib.rerate_ack');
		// A previous "neutral" is still a previous rating
		expect(rateAckKey(0)).toBe('delib.rerate_ack');
	});
});

describe('RateScale acknowledgment', () => {
	beforeEach(() => {
		vi.stubGlobal('window', globalThis);
		ratings.myRatings = {};
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function press(): string {
		const component = RateScale();
		const node = {
			attrs: { session: { challengeQuestionId: 'q' } as AgoraSession, proposalId: 'p' },
		} as unknown as m.Vnode<RateScaleAttrs>;
		const before = component.view.call(component, node) as m.Vnode[];
		const scale = before[1] as m.Vnode;
		const faces = scale.children as m.Vnode[];
		(faces[3].attrs as { onclick: () => void }).onclick();
		const after = component.view.call(component, node) as m.Vnode[];
		component.onremove?.call(component, node as m.VnodeDOM<RateScaleAttrs>);

		return JSON.stringify(after[0]);
	}

	it('a first press says the rating was saved, not that it was updated', () => {
		const ack = press();
		expect(ack).toContain(t('rate.saved_ack'));
		expect(ack).not.toContain(t('delib.rerate_ack'));
	});

	it('a press over an earlier rating says it was updated', () => {
		ratings.myRatings = { p: { value: -0.5 } };
		expect(press()).toContain(t('delib.rerate_ack'));
	});
});
