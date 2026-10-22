import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Statement } from '@freedi/shared-types';

vi.mock('@/lib/classroom/introData', () => ({
	fetchIntroBlocks: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/lib/fullscreen', () => ({
	enterFullscreen: vi.fn(),
	fullscreenSupported: vi.fn(() => true),
	onFullscreenChange: vi.fn(() => () => {}),
}));

import { OpeningPanel } from '../OpeningPanel';
import { enterFullscreen, fullscreenSupported } from '@/lib/fullscreen';

const VIDEOS = [
	{ id: 'a', title: 'One', url: 'https://youtu.be/dQw4w9WgXcQ' },
	{ id: 'b', title: 'Two', url: 'https://example.com/clip.mp4' },
];

function mainOf(description: string, videos: typeof VIDEOS): Statement {
	return {
		statementId: 'mid1',
		description,
		statementSettings: { introVideos: videos, lessonPlan: { projectorVideoId: 'b' } },
	} as unknown as Statement;
}

interface PanelInstance {
	state: Record<string, unknown>;
	vnode: m.Vnode<{ main: Statement }>;
}

function mount(main: Statement): PanelInstance {
	const state: Record<string, unknown> = {};
	const vnode = { attrs: { main }, state } as unknown as m.Vnode<{ main: Statement }>;
	(OpeningPanel.oninit as (v: m.Vnode<{ main: Statement }>) => void)(vnode);

	return { state, vnode };
}

const view = (p: PanelInstance): m.Vnode =>
	(OpeningPanel.view as (v: m.Vnode<{ main: Statement }>) => m.Vnode)(p.vnode);

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

const hasClass = (v: m.Vnode, name: string): boolean => {
	const a = (v.attrs ?? {}) as { className?: string; class?: string };

	return `${a.className ?? ''} ${a.class ?? ''}`.includes(name);
};
const attrsOfRows = (tree: m.Vnode): Record<string, unknown> =>
	flatten(tree).find((v) => typeof v.tag === 'object' && 'onOpen' in (v.attrs ?? {}))
		?.attrs as Record<string, unknown>;

describe('OpeningPanel', () => {
	beforeEach(() => vi.clearAllMocks());

	it('no introduction: the empty line and the add link to the plan', () => {
		const p = mount(mainOf('', []));
		const nodes = flatten(view(p));
		expect(nodes.some((v) => hasClass(v, 'opening-panel__empty'))).toBe(true);
		const add = nodes.find((v) => hasClass(v, 'opening-panel__add'));
		expect((add?.attrs as { href: string }).href).toBe('/t/mid1/plan?focus=intro');
		expect(nodes.some((v) => hasClass(v, 'opening-panel__edit'))).toBe(false);
	});

	it('text only: edit link and text, no video rows', () => {
		const nodes = flatten(view(mount(mainOf('Hello class', []))));
		expect(nodes.some((v) => hasClass(v, 'opening-panel__edit'))).toBe(true);
		expect(nodes.some((v) => hasClass(v, 'opening-panel__empty'))).toBe(false);
		expect(JSON.stringify(nodes.map((v) => v.children))).toContain('Hello class');
	});

	it('videos only: rows are given, the live one is the projector video', () => {
		const rows = attrsOfRows(view(mount(mainOf('', VIDEOS))));
		expect(rows.liveId).toBe('b');
		expect(rows.preload).toBe('metadata');
		expect((rows.videos as unknown[]).length).toBe(2);
	});

	it('one player at a time, and a failed id closes its player', () => {
		const p = mount(mainOf('', VIDEOS));
		const first = attrsOfRows(view(p));
		(first.onOpen as (id: string) => void)('a');
		(first.onOpen as (id: string) => void)('b');
		expect(attrsOfRows(view(p)).openId).toBe('b');
		(first.onFailed as (id: string) => void)('b');
		const after = attrsOfRows(view(p));
		expect(after.openId).toBeNull();
		expect((after.failedIds as Set<string>).has('b')).toBe(true);
		expect(after.failedText).toBeTruthy();
	});

	it('the full screen callback gets the frame and does not touch the projector', () => {
		const rows = attrsOfRows(view(mount(mainOf('', VIDEOS))));
		const frame = {} as HTMLElement;
		(rows.onFullscreen as (f: HTMLElement) => void)(frame);
		expect(enterFullscreen).toHaveBeenCalledWith(frame);
	});

	it('no full screen callback when the browser does not support it', () => {
		vi.mocked(fullscreenSupported).mockReturnValueOnce(false);
		expect(attrsOfRows(view(mount(mainOf('', VIDEOS)))).onFullscreen).toBeUndefined();
	});
});
