// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { RankList } from '@/components/RankList';
import { toggleRank } from '@/logic/ranking';
import { makeTopic } from '../../__tests__/fixtures';

const ROW_HEIGHT_PX = 100;
const topics: TableAssignmentTopic[] = ['a', 'b', 'c', 'd'].map((id, index) =>
	makeTopic(id, index),
);

type AnimateFn = (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => Animation;

const animateCalls: HTMLElement[] = [];
let root: HTMLElement;
let ranked: string[];
let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;

function draw(): void {
	m.render(
		root,
		m(RankList, {
			topics,
			ranked,
			matches: () => true,
			onToggle: (topicId: string) => {
				ranked = toggleRank(ranked, topicId);
				draw();
			},
			onReorder: (next: string[]) => {
				ranked = next;
				draw();
			},
		}),
	);
}

function stubReducedMotion(reduced: boolean): void {
	window.matchMedia = ((query: string) =>
		({
			matches: reduced && query.includes('reduce'),
		}) as MediaQueryList) as typeof window.matchMedia;
}

function rowOf(id: string): HTMLElement {
	const row = root.querySelector<HTMLElement>(`.rank-row[data-topic-id="${id}"]`);

	if (!row) throw new Error(`row ${id} missing`);

	return row;
}

beforeEach(() => {
	animateCalls.length = 0;
	ranked = ['a', 'b', 'c'];
	root = document.createElement('div');
	document.body.appendChild(root);
	originalRect = HTMLElement.prototype.getBoundingClientRect;
	// Each row sits at its place in the DOM, so a reorder really moves it.
	HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
		const index = this.classList.contains('rank-row')
			? Array.from(this.parentElement?.children ?? []).indexOf(this)
			: 0;
		const top = index * ROW_HEIGHT_PX;

		return { top, bottom: top + ROW_HEIGHT_PX, height: ROW_HEIGHT_PX } as DOMRect;
	};
	(HTMLElement.prototype as unknown as { animate: AnimateFn }).animate = vi.fn(function (
		this: HTMLElement,
	) {
		animateCalls.push(this);

		return {} as Animation;
	});
	stubReducedMotion(false);
	draw();
});

afterEach(() => {
	m.render(root, null);
	root.remove();
	HTMLElement.prototype.getBoundingClientRect = originalRect;
	delete (HTMLElement.prototype as unknown as { animate?: AnimateFn }).animate;
});

describe('RankList rows', () => {
	it('renders a data-topic-id on every row and a hidden glow inside it', () => {
		topics.forEach((topic) => {
			const row = rowOf(topic.topicId);
			const glow = row.querySelector('.rank-row__glow');

			expect(glow?.getAttribute('aria-hidden')).toBe('true');
		});
	});

	it('does not mark unpicked rows as disabled when the list is full', () => {
		expect(rowOf('d').querySelector('.rank-row__pick')?.hasAttribute('aria-disabled')).toBe(false);
	});
});

describe('RankList keyboard', () => {
	it("gives the focus back to the moved row's handle", () => {
		const handle = rowOf('a').querySelector<HTMLButtonElement>('.rank-row__handle');

		handle?.focus();
		handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

		expect(ranked).toEqual(['b', 'a', 'c']);
		expect(document.activeElement).toBe(rowOf('a').querySelector('.rank-row__handle'));
	});
});

describe('RankList animation', () => {
	function tapFourth(): void {
		rowOf('d').querySelector<HTMLButtonElement>('.rank-row__pick')?.click();
	}

	it('slides the landed row and the pushed-out row, and lights the landed row', () => {
		tapFourth();

		const glow = rowOf('d').querySelector('.rank-row__glow');

		expect(ranked).toEqual(['a', 'b', 'd']);
		expect(animateCalls).toContain(rowOf('d'));
		expect(animateCalls).toContain(rowOf('c'));
		expect(animateCalls).toContain(glow);
		expect(animateCalls).not.toContain(rowOf('a'));
		expect(animateCalls).not.toContain(rowOf('b'));
	});

	it('slides a row removed by tapping it again', () => {
		rowOf('a').querySelector<HTMLButtonElement>('.rank-row__pick')?.click();

		expect(ranked).toEqual(['b', 'c']);
		expect(animateCalls).toContain(rowOf('a'));
		expect(animateCalls).toContain(rowOf('b'));
	});

	it('plays nothing under reduced motion', () => {
		stubReducedMotion(true);
		tapFourth();

		expect(ranked).toEqual(['a', 'b', 'd']);
		expect(animateCalls).toHaveLength(0);
	});

	it('does not keep stale positions after a tap that changed nothing', () => {
		const redraws = (): void => draw();

		// A redraw with no tap (as a drag end would cause) must not animate.
		redraws();
		redraws();

		expect(animateCalls).toHaveLength(0);
	});
});
