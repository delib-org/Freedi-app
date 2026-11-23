import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('../ProjectorMenu', () => ({ showHere: vi.fn() }));

import { JoiningCard } from '../JoiningCard';
import { QRShare } from '@/components/QRShare';
import type { JoiningCardAttrs } from '../JoiningCard';

type View = (vnode: { attrs: JoiningCardAttrs }) => m.Vnode;

describe('JoiningCard', () => {
	const attrs: JoiningCardAttrs = {
		mid: 'mid1',
		code: '123456',
		url: 'https://x.test/j/mid1',
		title: 'Lesson',
		address: 'x.test',
	};

	it('keeps the card calm: no primary button, the projector button is secondary', () => {
		const card = (JoiningCard.view as unknown as View)({ attrs });
		const share = (card.children as m.Vnode[]).find((c) => c.tag === (QRShare as unknown));
		const shareAttrs = share?.attrs as { quietActions?: boolean; extraAction: m.Vnode };

		expect(shareAttrs.quietActions).toBe(true);
		const { className } = shareAttrs.extraAction.attrs as { className: string };

		expect(className).toContain('btn--secondary');
		expect(className).not.toContain('btn--primary');
	});
});
