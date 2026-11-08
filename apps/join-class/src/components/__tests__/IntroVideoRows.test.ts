import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { IntroVideoRows, type IntroVideoRowsAttrs } from '../IntroVideoRows';

const VIDEOS = [
	{ id: 'a', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'One' },
	{ id: 'b', url: 'https://example.com/clip.mp4', title: 'Two' },
];

function attrs(extra: Partial<IntroVideoRowsAttrs> = {}): IntroVideoRowsAttrs {
	return {
		videos: VIDEOS,
		liveId: null,
		openId: 'a',
		failedIds: new Set<string>(),
		onOpen: vi.fn(),
		onFailed: vi.fn(),
		...extra,
	};
}

function find(node: m.Children, test: (v: m.Vnode) => boolean, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => find(c, test, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		if (typeof v.tag === 'string' && test(v)) out.push(v);
		find(v.children as m.Children, test, out);
	}

	return out;
}

const render = (a: IntroVideoRowsAttrs): m.Children =>
	(IntroVideoRows.view as (v: { attrs: IntroVideoRowsAttrs }) => m.Children)({ attrs: a });
const tagHas =
	(part: string) =>
	(v: m.Vnode): boolean =>
		String((v.attrs as { className?: string } | null)?.className ?? '').includes(part);

describe('IntroVideoRows', () => {
	it('phone: renders no full screen button', () => {
		expect(find(render(attrs()), tagHas('intro-video-row__fullscreen'))).toHaveLength(0);
	});

	it('console: the open row has a full screen button that hands over the frame', () => {
		const onFullscreen = vi.fn();
		const buttons = find(render(attrs({ onFullscreen })), tagHas('intro-video-row__fullscreen'));
		expect(buttons).toHaveLength(1);
		const frame = { name: 'frame' } as unknown as HTMLElement;
		const rowEl = { querySelector: () => frame };
		(buttons[0].attrs as { onclick: (e: Event) => void }).onclick({
			currentTarget: { closest: () => rowEl },
		} as unknown as Event);
		expect(onFullscreen).toHaveBeenCalledWith(frame);
	});

	it('console: no button while no row is open', () => {
		const out = render(attrs({ openId: null, onFullscreen: vi.fn() }));
		expect(find(out, tagHas('intro-video-row__fullscreen'))).toHaveLength(0);
	});

	it('wraps the open player in the frame and honours preload', () => {
		const out = render(attrs({ openId: 'b', preload: 'metadata' }));
		expect(find(out, tagHas('intro-video-row__frame'))).toHaveLength(1);
		const video = find(out, (v) => v.tag === 'video');
		expect((video[0].attrs as { preload: string }).preload).toBe('metadata');
	});

	it('shows the given failed text', () => {
		const out = render(attrs({ openId: null, failedIds: new Set(['b']), failedText: 'FAILED-X' }));
		const note = find(out, tagHas('intro-video-row__note'));
		expect(note).toHaveLength(1);
		expect(JSON.stringify(note[0].children)).toContain('FAILED-X');
	});
});
