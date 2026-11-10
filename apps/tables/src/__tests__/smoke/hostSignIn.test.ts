// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostParticipants } from '@/views/host/HostParticipants';
import { makeRosterEntry } from '../fixtures';
import { renderScreen } from './testHarness';
import { ID, fakeHostAuth, mocks, settle, useHostScreens } from './hostMocks';

/** Every read a host screen starts, in the order it starts them. */
const started = vi.hoisted((): string[] => []);

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => {
	const { fakeData } = await import('./hostMocks');
	type Read<T> = (
		onData: (data: T) => void,
		onError: (error: { code: string }) => void,
	) => () => void;

	function counted<T>(name: string, read: Read<T>): Read<T> {
		return (onData, onError) => {
			started.push(name);

			return read(onData, onError);
		};
	}

	return {
		...fakeData,
		subscribeSession: () => counted('session', fakeData.subscribeSession()),
		subscribeRoster: () => counted('roster', fakeData.subscribeRoster()),
	};
});

useHostScreens();

const auth = fakeHostAuth.hostAuth as { status: string; user: { uid: string } | null };

function signOut(): void {
	auth.status = 'signedOut';
	auth.user = null;
}

function signIn(): void {
	auth.status = 'signedIn';
	auth.user = { uid: 'host-1' };
}

describe('a host link opened before signing in (the projector, a new device)', () => {
	afterEach(() => {
		signIn();
		started.length = 0;
	});

	it('reads nothing while the sign-in gate shows: the rules would refuse it', async () => {
		signOut();

		const { text } = await renderScreen(HostParticipants, ID);

		expect(text).toContain(en['tableAssignment.signIn.google']);
		expect(started).toEqual([]);
	});

	it('starts reading once the host signs in, with no reload', async () => {
		signOut();
		mocks.store.current.everyone = [makeRosterEntry('u1', { fullName: 'Dana Levi' })];

		const { root } = await renderScreen(HostParticipants, ID);

		signIn();
		await settle();

		expect(started).toEqual(['session', 'roster']);
		expect(root.textContent).toContain('Dana Levi');
	});
});
