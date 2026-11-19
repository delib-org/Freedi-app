import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));
vi.mock('../consoleActions', () => ({
	moveStudent: vi.fn(),
	tableAction: vi.fn(),
	addNoDevice: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({}));
vi.mock('../dragController', () => ({
	dropAttrs: vi.fn(() => ({})),
	pressChip: vi.fn(),
	keyChip: vi.fn(),
	blurChip: vi.fn(),
	targetName: vi.fn(() => ''),
}));

import { MemberChip } from '../MemberChip';
import { ProposalsSpeakerRow } from '../ProposalsSpeakerRow';
import { resetConsoleState } from '../consoleState';

/** Trello 7WaCiZ3K: in Proposals the teacher sees who speaks at each table, in words and not colour alone. */

function flatten(node: m.Children, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((c) => flatten(c, out));
	else if (node && typeof node === 'object') {
		const v = node as m.Vnode;
		out.push(v);
		flatten(v.children as m.Children, out);
	}

	return out;
}

function rowTree(
	speaker: Parameters<typeof ProposalsSpeakerRow.view>[0]['attrs']['speaker'],
): string {
	return JSON.stringify(
		(ProposalsSpeakerRow.view as unknown as (v: m.Vnode) => m.Vnode)({
			attrs: { speaker, name: 'Dana' },
		} as unknown as m.Vnode),
	);
}

function chip(speaking: boolean): m.Vnode {
	return (MemberChip.view as unknown as (v: m.Vnode) => m.Vnode)({
		attrs: { uid: 'u1', name: 'Dana', speaking, from: 1, tableNumbers: [1] },
	} as unknown as m.Vnode);
}

describe('who is speaking at a table (Proposals)', () => {
	beforeEach(() => {
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('the row names the speaker with a glyph and the time left', () => {
		const markup = rowTree({ kind: 'speaking', uid: 'u1', msLeft: 45_000 });

		expect(markup).toContain('speaker-row--speaking');
		expect(markup).toContain('console.speaking_now');
		expect(markup).toContain('0:45');
	});

	it('the row has a clear state when nobody speaks', () => {
		const markup = rowTree({ kind: 'nobody' });

		expect(markup).toContain('speaker-row--nobody');
		expect(markup).toContain('console.speaking_nobody');
		expect(markup).not.toContain('speaker-row--speaking');
	});

	it('the speaker chip carries a class, a glyph, a word and the spoken label', () => {
		const markup = JSON.stringify(chip(true));

		expect(markup).toContain('member-chip--speaking');
		expect(markup).toContain('console.speaking_tag');
		expect(markup).toContain('Dana, console.speaking_now');
		const button = flatten(chip(true)).find(
			(v) => (v.attrs as { 'data-uid'?: string } | null)?.['data-uid'] === 'u1',
		);

		expect((button?.attrs as { 'aria-label': string })['aria-label']).toContain('Dana');
	});

	it('a chip of someone who is not speaking has none of it', () => {
		const markup = JSON.stringify(chip(false));

		expect(markup).not.toContain('member-chip--speaking');
		expect(markup).not.toContain('console.speaking_tag');
	});
});
