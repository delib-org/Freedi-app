// @vitest-environment jsdom
import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostParticipants } from '@/views/host/HostParticipants';
import { hostListPath } from '@/paths';
import { SESSION_ID, makeRosterEntry, makeSession } from '../fixtures';
import { renderScreen } from './testHarness';
import { ID, buttonByText, mocks, settle, useHostScreens } from './hostMocks';

const nav = vi.hoisted(() => ({ goTo: vi.fn() }));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => (await import('./hostMocks')).fakeData);
vi.mock('@/lib/navigate', () => ({ goTo: nav.goTo, replaceWith: vi.fn() }));

useHostScreens();

function openDialog(root: HTMLElement): void {
	buttonByText(root, en['tableAssignment.delete']).click();
	m.redraw.sync();
}

describe('delete this assignment', () => {
	it('asks first, says what goes, and calls nothing until confirmed', async () => {
		nav.goTo.mockReset();
		mocks.store.current.everyone = [makeRosterEntry('u1')];
		const { root } = await renderScreen(HostParticipants, ID);

		openDialog(root);

		expect(root.querySelector('.modal')?.textContent).toContain(en['tableAssignment.delete.body']);
		expect(en['tableAssignment.delete.body']).toContain('cannot be undone');
		expect(mocks.api.deleteSession).not.toHaveBeenCalled();
	});

	it('deletes after the confirmation and goes to the host list', async () => {
		nav.goTo.mockReset();
		mocks.store.current.everyone = [makeRosterEntry('u1')];
		const { root } = await renderScreen(HostParticipants, ID);

		openDialog(root);
		buttonByText(root, en['tableAssignment.delete.confirm']).click();
		await settle();

		expect(mocks.api.deleteSession).toHaveBeenCalledWith({ sessionId: SESSION_ID });
		expect(nav.goTo).toHaveBeenCalledWith(hostListPath());
	});

	it('keeps the dialog usable and shows an error when it fails, then works on retry', async () => {
		nav.goTo.mockReset();
		mocks.store.current.everyone = [makeRosterEntry('u1')];
		mocks.api.deleteSession.mockRejectedValueOnce({ code: 'functions/unavailable' });
		const { root } = await renderScreen(HostParticipants, ID);

		openDialog(root);
		buttonByText(root, en['tableAssignment.delete.confirm']).click();
		await settle();

		expect(root.querySelector('.modal')).not.toBeNull();
		expect(root.textContent).toContain(en['tableAssignment.error.network']);
		expect(nav.goTo).not.toHaveBeenCalled();

		buttonByText(root, en['tableAssignment.delete.confirm']).click();
		await settle();

		expect(nav.goTo).toHaveBeenCalledWith(hostListPath());
	});

	it('is offered on an ended assignment too', async () => {
		mocks.store.current.session = makeSession({ status: 'ended' });
		mocks.store.current.everyone = [makeRosterEntry('u1')];
		const { root } = await renderScreen(HostParticipants, ID);

		expect(buttonByText(root, en['tableAssignment.delete'])).toBeTruthy();
	});
});

describe('claimed by name marker', () => {
	it('shows on the host list of participants, only for a claimed registration', async () => {
		mocks.store.current.everyone = [
			makeRosterEntry('u1', { claimedByName: true }),
			makeRosterEntry('u2'),
		];
		const { root } = await renderScreen(HostParticipants, ID);
		const tags = root.querySelectorAll('.roster__tag');

		expect(tags).toHaveLength(1);
		expect(tags[0].closest('li')?.textContent).toContain('Name u1');
		expect(tags[0].textContent).toBe(en['tableAssignment.participants.claimedByName']);
	});

	it('is never read by a participant screen or the room screen', () => {
		const sources = import.meta.glob('../../views/{participant,room}/*.ts', {
			query: '?raw',
			import: 'default',
			eager: true,
		});

		expect(Object.keys(sources).length).toBeGreaterThan(5);

		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toContain('claimedByName');
		}
	});
});
