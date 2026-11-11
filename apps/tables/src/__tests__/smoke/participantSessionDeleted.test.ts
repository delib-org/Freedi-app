// @vitest-environment jsdom
import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { makeSession } from '../fixtures';
import { renderScreen } from './testHarness';
import { ID, mocks, settle, useParticipantScreens } from './participantMocks';

const live = vi.hoisted(() => ({
	starts: 0,
	push: (_session: unknown): void => undefined,
}));

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./participantMocks')).mocks.api,
}));
vi.mock('@/lib/navigate', async () => {
	const { mocks } = await import('./participantMocks');

	return { goTo: mocks.goTo, replaceWith: mocks.replaceWith };
});
vi.mock('@/lib/auth', () => ({ ensureParticipantUser: async () => ({ uid: 'u1' }) }));
vi.mock('@/lib/tableAssignment/data', async () => ({
	...(await import('./participantMocks')).fakeDataModule(),
	subscribeSession: () => (onData: (session: unknown) => void) => {
		live.starts += 1;
		live.push = onData;
		onData(makeSession({ status: 'registrationOpen' }));

		return () => undefined;
	},
}));

useParticipantScreens();

describe('a session deleted while the participant has it open', () => {
	it('reaches a clean "not found" state and does not re-subscribe in a loop', async () => {
		mocks.store.current.me = null;
		live.starts = 0;
		const { root } = await renderScreen(ParticipantHome, ID);

		expect(root.textContent).not.toContain(en['tableAssignment.state.notFound']);

		live.push(null);
		await settle();
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.state.notFound']);
		expect(root.textContent).not.toContain(en['tableAssignment.state.error']);
		expect(root.querySelector('.state-box button')).toBeNull();
		expect(live.starts).toBe(1);
		m.redraw.sync();
		expect(live.starts).toBe(1);
	});
});
