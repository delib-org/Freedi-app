// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostParticipants } from '@/views/host/HostParticipants';
import { HostPreview } from '@/views/host/HostPreview';
import { makeRosterEntry, makeRun, makeSession } from '../fixtures';
import { renderScreen } from './testHarness';
import { ID, mocks, useHostScreens } from './hostMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA' } }));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => (await import('./hostMocks')).fakeData);

useHostScreens();

/** The fixture's published run seats u1, u2 and u3; u4 and u5 registered after it. */
function publishedWithLatecomers(): void {
	mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
	mocks.store.current.runs = [makeRun({ status: 'published' })];
	mocks.store.current.everyone = ['u1', 'u2', 'u3', 'u4', 'u5'].map((uid) => makeRosterEntry(uid));
}

describe('host preview after publishing', () => {
	it('says how many people are new since the published run', async () => {
		publishedWithLatecomers();

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).toContain('2 people registered after the tables were published');
	});

	it('says nothing when everyone is seated', async () => {
		publishedWithLatecomers();
		mocks.store.current.everyone = ['u1', 'u2', 'u3'].map((uid) => makeRosterEntry(uid));

		const { text } = await renderScreen(HostPreview, ID);

		expect(text).not.toContain('registered after the tables were published');
	});
});

describe('host participants after publishing', () => {
	it('marks the registered people who have no seat yet, and counts them', async () => {
		publishedWithLatecomers();

		const { root } = await renderScreen(HostParticipants, ID);
		const tagged = Array.from(root.querySelectorAll('.roster__item'))
			.filter((item) => item.textContent?.includes(en['tableAssignment.participants.unseated']))
			.map((item) => item.querySelector('.roster__name')?.textContent);

		expect(tagged).toEqual(['Name u4', 'Name u5']);
		expect(root.querySelector('.counts')?.textContent).toContain(
			en['tableAssignment.count.unseated'],
		);
	});

	it('marks nobody before the tables are published', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.everyone = ['u1', 'u2'].map((uid) => makeRosterEntry(uid));

		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).not.toContain(en['tableAssignment.participants.unseated']);
	});
});
