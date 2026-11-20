// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable, Statement } from '@freedi/shared-types';

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/liveDrafts', () => ({
	isBroadcasting: () => false,
	startBroadcast: vi.fn(),
	stopBroadcast: vi.fn(),
	updateBroadcastText: vi.fn(),
}));
vi.mock('@/lib/classroom/proposals', () => ({
	newProposalId: () => 'p1',
	sendProposal: vi.fn(async () => ({ ok: true })),
	changeProposal: vi.fn(async () => ({ ok: true })),
}));

import { mountSmoke } from '@/views/__tests__/mountSmoke';
import { FlowFeed } from '../FlowFeed';
import { WritePanel } from '../WritePanel';

const main = {
	statementId: 'm',
	statement: 'Lesson',
	statementSettings: {},
} as unknown as Statement;
const challenge = {
	statementId: 'q1',
	statement: 'Q',
	statementSettings: {},
} as unknown as Statement;

const table = {
	tableId: 'm--1',
	mainId: 'm',
	n: 1,
	memberUids: ['me', 'noa'],
	noDeviceMembers: [],
	step: 'write',
	writerUid: 'me',
	askerUid: null,
	turn: 1,
	writingMode: 'each',
	writingLocked: false,
	spokenUids: [],
	usedQuestionIds: [],
	updatedAt: 0,
} as ClassTable;

function hide(): void {
	Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
	document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
	Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
	document.body.innerHTML = '';
	localStorage.clear();
});

function mountPen(onRelease: () => void) {
	return mountSmoke(() =>
		m(WritePanel, {
			main,
			table,
			feed: new FlowFeed(),
			uid: 'me',
			challenge,
			locked: false,
			mode: 'pen',
			busy: false,
			onPass: vi.fn(),
			onRelease,
		}),
	);
}

describe('the pen holder leaving the screen', () => {
	it('gives the pen back when it is still theirs', () => {
		const onRelease = vi.fn();
		const mounted = mountPen(onRelease);
		hide();

		expect(onRelease).toHaveBeenCalledTimes(1);
		mounted.unmount();
	});

	it('still gives the pen back when a pass failed (the table still shows the pen as theirs)', () => {
		const onRelease = vi.fn();
		const mounted = mountPen(onRelease);
		mounted.root.querySelector<HTMLButtonElement>('[data-testid="pen-pass"]')?.click();
		mounted.redraw();
		hide();

		expect(onRelease).toHaveBeenCalledTimes(1);
		mounted.unmount();
	});

	it('does not ask for the pen back once a pass went through (the table moved the pen away)', () => {
		const onRelease = vi.fn();
		let current: ClassTable = table;
		const mounted = mountSmoke(() =>
			m(WritePanel, {
				main,
				table: current,
				feed: new FlowFeed(),
				uid: 'me',
				challenge,
				locked: false,
				mode: 'pen',
				busy: false,
				onPass: vi.fn(),
				onRelease,
			}),
		);
		mounted.root.querySelector<HTMLButtonElement>('[data-testid="pen-pass"]')?.click();
		current = { ...table, writerUid: undefined };
		mounted.redraw();
		hide();

		expect(onRelease).not.toHaveBeenCalled();
		mounted.unmount();
	});

	it('does not ask for the pen back after the proposal was sent (the server already freed it)', async () => {
		const onRelease = vi.fn();
		const mounted = mountPen(onRelease);
		const box = mounted.root.querySelector<HTMLTextAreaElement>('textarea');
		if (!box) throw new Error('no write box');
		box.value = 'Plant trees';
		box.dispatchEvent(new Event('input', { bubbles: true }));
		mounted.redraw();
		mounted.root.querySelector<HTMLButtonElement>('[data-testid="proposal-send"]')?.click();
		await new Promise((resolve) => setTimeout(resolve, 5));
		mounted.redraw();
		hide();

		expect(onRelease).not.toHaveBeenCalled();
		mounted.unmount();
	});
});
