// Shared by the host smoke tests: the fakes behind the mocked modules, and small helpers.
import m from 'mithril';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { makeSession, SESSION_ID } from '../fixtures';
import { emptyStore, unmountAll } from './testHarness';
import type { FakeStore } from './testHarness';
import { initI18n } from '@/lib/i18n';

export const ID = { id: SESSION_ID };

export const mocks = {
	store: { current: emptyStore() },
	api: {
		createSession: vi.fn(),
		saveSettings: vi.fn(),
		saveTopics: vi.fn(),
		setStatus: vi.fn(),
		computePreview: vi.fn(),
		publishRun: vi.fn(),
		fixDetails: vi.fn(),
		removeParticipant: vi.fn(),
		deleteSession: vi.fn(),
	},
};

type Sub<T> = (onData: (data: T) => void, onError: (error: { code: string }) => void) => () => void;

function sub<T>(read: (store: FakeStore) => T, topics = false): Sub<T> {
	return (onData, onError) => {
		const store = mocks.store.current;
		const code = (topics ? store.failTopicsWith : null) ?? store.failWith;

		if (code) onError({ code });
		else onData(read(store));

		return () => undefined;
	};
}

export const fakeData = {
	subscribeHostSessions: () => sub((s) => s.hostSessions),
	subscribeSession: () => sub((s) => s.session),
	subscribeTopics: () => sub((s) => s.topics, true),
	subscribeRoster: () => sub((s) => s.everyone),
	subscribeMyParticipant: () => sub((s) => s.me),
	subscribeRun: () => sub((s) => s.run),
	subscribeRuns: () => sub((s) => s.runs),
	subscribeCounter: () => sub((s) => s.registeredCount),
	fetchChosenOptions: async (): Promise<never[]> => [],
};

export const fakeHostAuth = {
	hostAuth: { status: 'signedIn', user: { uid: 'host-1' }, signInFailed: false },
	startHostAuth: (): void => undefined,
	signInHost: async (): Promise<void> => undefined,
	signOutHost: async (): Promise<void> => undefined,
};

export function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
	const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);

	if (!button) throw new Error(`No button "${text}"`);

	return button;
}

export function buttonByTextStart(root: HTMLElement, text: string): HTMLButtonElement {
	const button = Array.from(root.querySelectorAll('button')).find((b) =>
		b.textContent?.startsWith(text),
	);

	if (!button) throw new Error(`No button starting "${text}"`);

	return button;
}

export function buttonsByText(root: HTMLElement, text: string): HTMLButtonElement[] {
	return Array.from(root.querySelectorAll('button')).filter((b) => b.textContent === text);
}

export function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	field.value = value;
	field.dispatchEvent(new Event('input', { bubbles: true }));
}

export async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	m.redraw.sync();
	await new Promise((resolve) => setTimeout(resolve, 0));
	m.redraw.sync();
}

/** The language, a draft session and working callables, reset for every test of a host suite. */
export function useHostScreens(): void {
	beforeAll(async () => {
		window.localStorage.setItem('freedi_tables_lang', 'en');
		await initI18n();
	});

	beforeEach(() => {
		window.localStorage.clear();
		window.localStorage.setItem('freedi_tables_lang', 'en');
		mocks.store.current = emptyStore();
		mocks.store.current.session = makeSession();
		Object.values(mocks.api).forEach((fn) => fn.mockReset());
		mocks.api.saveSettings.mockResolvedValue({ settings: {} });
		mocks.api.saveTopics.mockResolvedValue({ topicIds: [] });
		mocks.api.setStatus.mockResolvedValue({ status: 'registrationOpen' });
		mocks.api.computePreview.mockResolvedValue({ runId: 'run-2' });
		mocks.api.publishRun.mockResolvedValue({ publishedRunId: 'run-1' });
		mocks.api.fixDetails.mockResolvedValue({ title: 'x', topicIds: [] });
		mocks.api.removeParticipant.mockResolvedValue({ removed: true });
		mocks.api.deleteSession.mockResolvedValue({ deleted: true });
	});

	afterEach(unmountAll);
}
