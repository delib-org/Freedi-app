// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostAssignment } from '@/views/host/HostAssignment';
import { HostHome } from '@/views/host/HostHome';
import { HostNew } from '@/views/host/HostSetup';
import { rememberCloseFlags } from '@/logic/closeFlags';
import { hostScreenPath } from '@/paths';
import { makeRun, makeSession, makeTopic, NOW, SESSION_ID } from '../fixtures';
import { renderScreen } from './testHarness';
import { buttonByText, buttonByTextStart, ID, mocks, settle, useHostScreens } from './hostMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('@/lib/navigate', () => ({ goTo: vi.fn(), rewriteAddress: vi.fn(), replaceWith: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA' } }));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => (await import('./hostMocks')).fakeData);

useHostScreens();

const CLOSE = 'tableAssignment.live.close.direct';

function splitOpen(): void {
	mocks.store.current.session = makeSession({
		mode: 'direct',
		splitByTopic: true,
		status: 'registrationOpen',
	});
	mocks.store.current.topics = [
		makeTopic('a', 0, { chosenCount: 70 }),
		makeTopic('b', 1, { chosenCount: 1 }),
		makeTopic('c', 2),
	];
}

describe('registration open, sit where you like', () => {
	it('shows people and the tables that would open per topic, 70 at 7 being ten', async () => {
		splitOpen();

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain('70 people chose this topic');
		expect(text).toContain('10 tables will open');
		expect(text).toContain('One table will open');
	});

	it('flags a topic with one person before the press, and only that topic', async () => {
		splitOpen();

		const { root } = await renderScreen(HostHome, ID);
		const flags = Array.from(root.querySelectorAll('.topic-counts__flag')).map(
			(flag) => flag.textContent,
		);

		expect(flags).toEqual(['One person registered for Topic b']);
	});

	it('closes and publishes in one press, without computing a preview', async () => {
		splitOpen();
		mocks.api.setStatus.mockResolvedValue({
			status: 'published',
			publishedRunId: 'run-1',
			topicsWithOnePerson: ['b'],
		});

		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en[CLOSE]).click();
		await settle();

		expect(mocks.api.setStatus).toHaveBeenCalledTimes(1);
		expect(mocks.api.setStatus).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			status: 'registrationClosed',
		});
		expect(mocks.api.computePreview).not.toHaveBeenCalled();
		const { goTo } = await import('@/lib/navigate');

		expect(goTo).toHaveBeenCalledWith(hostScreenPath(SESSION_ID, 'assignment'));
	});

	it('keeps the mix button and flow for a ranked session', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.topics = [makeTopic('a', 0)];

		const { text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.live.close']);
		expect(text).not.toContain(en[CLOSE]);
	});
});

describe('after closing, sit where you like', () => {
	it('shows the one-person topics the server reported, and moves nobody', async () => {
		mocks.store.current.session = makeSession({
			mode: 'direct',
			splitByTopic: true,
			status: 'published',
			publishedRunId: 'run-1',
		});
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
		mocks.store.current.run = makeRun({ status: 'published', publishedAt: NOW });
		rememberCloseFlags(SESSION_ID, ['b']);

		const { text } = await renderScreen(HostAssignment, ID);

		expect(text).toContain('One person registered for Topic b');
		expect(mocks.api.computePreview).not.toHaveBeenCalled();
		expect(mocks.api.publishRun).not.toHaveBeenCalled();
	});
});

describe('Setup, how many topics', () => {
	it('asks one or several, and with one topic hides the topic list and the mode question', async () => {
		const { root } = await renderScreen(HostNew, {});

		expect(root.textContent).toContain(en['tableAssignment.setup.topicCount']);
		expect(root.querySelector('.setup__topic-input')).not.toBeNull();
		expect(root.textContent).toContain(en['tableAssignment.setup.mode']);

		buttonByTextStart(root, en['tableAssignment.setup.topicCount.one']).click();
		await settle();

		expect(root.querySelector('.setup__topic-input')).toBeNull();
		expect(root.textContent).not.toContain(en['tableAssignment.setup.mode']);
		expect(root.textContent).toContain(en['tableAssignment.setup.topicCount.one.hint']);
	});

	it('explains the seats and hints how many tables would open for the people expected', async () => {
		const { root } = await renderScreen(HostNew, {});
		const expected = root.querySelector<HTMLInputElement>('#setup-expected');

		expect(root.textContent).toContain(en['tableAssignment.setup.seats.hint']);
		expect(expected).not.toBeNull();
		if (expected) {
			expected.value = '70';
			expected.dispatchEvent(new Event('input', { bubbles: true }));
		}
		await settle();

		expect(root.textContent).toContain('About 10 tables');
	});
});
