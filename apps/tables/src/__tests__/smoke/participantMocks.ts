// Shared by the participant smoke tests: the fakes behind the mocked modules, and small helpers.
import m from 'mithril';
import type { TableAssignmentParticipant } from '@freedi/shared-types';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { makeParticipant, makeSession, makeTopic, SESSION_ID } from '../fixtures';
import { emptyStore, unmountAll } from './testHarness';
import type { FakeStore } from './testHarness';
import { initI18n } from '@/lib/i18n';
import { participantHomePath } from '@/paths';

export const mocks = {
	store: { current: emptyStore() },
	api: {
		register: vi.fn(),
		savePreferences: vi.fn(),
		joinTable: vi.fn(),
		cancelRegistration: vi.fn(),
	},
	goTo: vi.fn(),
	replaceWith: vi.fn(),
	pushMyRecord: (_record: TableAssignmentParticipant | null): void => undefined,
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

function seatCounts(store: FakeStore): Map<number, number> {
	const counts = new Map<number, number>();

	for (const p of store.everyone) {
		if (p.chosenTableIndex !== undefined) {
			counts.set(p.chosenTableIndex, (counts.get(p.chosenTableIndex) ?? 0) + 1);
		}
	}

	return counts;
}

/** Stands in for `@/lib/tableAssignment/data`. */
export function fakeDataModule(): Record<string, unknown> {
	return {
		subscribeSession: () => sub((s) => s.session),
		subscribeTopics: () => sub((s) => s.topics, true),
		subscribeSeats: () => sub(seatCounts),
		subscribeMyParticipant: (): Sub<FakeStore['me']> => (onData, onError) => {
			mocks.pushMyRecord = onData;

			return sub((s) => s.me)(onData, onError);
		},
		subscribeCounter: () => sub((s) => s.registeredCount),
		subscribeTablemates: () => sub((s) => s.everyone),
		subscribeRun: () => sub((s) => s.run),
	};
}

export const ID = { id: SESSION_ID };
export const HOME = participantHomePath(SESSION_ID);
export const DRAFT_KEY = `freedi_tables_prefs_${SESSION_ID}_u1`;
export const WITH_QUESTION = {
	tableSize: 7,
	balanceTolerance: 0.3,
	positionQuestion: { label: 'Parks?', poleA: 'Keep', poleB: 'Change' },
};

const TICK_MS = 5;

export async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, TICK_MS));
	m.redraw.sync();
}

export function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
	return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
}

export function clickButton(root: HTMLElement, text: string): void {
	const button = buttonWithText(root, text);

	if (!button) throw new Error(`button "${text}" not found`);
	button.click();
}

export function typeName(root: HTMLElement, value: string): void {
	const input = root.querySelector<HTMLInputElement>('input[name="name"]');

	if (!input) throw new Error('name field missing');
	input.value = value;
	input.dispatchEvent(new Event('input'));
}

export function submitForm(root: HTMLElement): void {
	root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
}

export function pressKey(target: Element, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

export function registered(): void {
	mocks.store.current.me = makeParticipant('u1');
}

/** Every participant test starts on an open assignment with three topics, in English. */
export function useParticipantScreens(): void {
	beforeAll(async () => {
		window.localStorage.setItem('freedi_tables_lang', 'en');
		await initI18n();
	});

	beforeEach(() => {
		mocks.store.current = emptyStore();
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1), makeTopic('c', 2)];
		vi.clearAllMocks();
		Object.values(mocks.api).forEach((fn) => fn.mockReset());
		window.localStorage.clear();
		window.localStorage.setItem('freedi_tables_lang', 'en');
	});

	afterEach(unmountAll);
}
