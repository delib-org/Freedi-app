// @vitest-environment jsdom
import m from 'mithril';
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { HostHome } from '@/views/host/HostHome';
import { HostNew, SetupBody } from '@/views/host/HostSetup';
import { readSetupBackup } from '@/logic/setupBackup';
import { SESSION_ID, makeSession, makeTopic } from '../fixtures';
import { renderScreen } from './testHarness';
import {
	ID,
	buttonByText,
	buttonByTextStart,
	mocks,
	settle,
	typeInto,
	useHostScreens,
} from './hostMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./hostMocks')).mocks.api,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA' } }));
vi.mock('@/lib/hostAuth', async () => (await import('./hostMocks')).fakeHostAuth);
vi.mock('@/lib/tableAssignment/data', async () => (await import('./hostMocks')).fakeData);

useHostScreens();

describe('Setup', () => {
	it('with no session yet: nothing is created until there is a name', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const { root } = await renderScreen(HostNew, {});

			typeInto(
				root.querySelector<HTMLInputElement>('.setup__topic-input') as HTMLInputElement,
				'Parks',
			);
			await vi.advanceTimersByTimeAsync(800);
			expect(mocks.api.createSession).not.toHaveBeenCalled();
			expect(root.textContent).toContain(en['tableAssignment.setup.problem.name']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('creates the assignment on the first saved name, then sends what was typed before', async () => {
		mocks.api.createSession.mockResolvedValue({ session: makeSession() });
		mocks.api.saveTopics.mockResolvedValue({ topicIds: ['t1'] });
		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const { root } = await renderScreen(HostNew, {});

			typeInto(root.querySelector('.setup__topic-input') as HTMLInputElement, 'Parks');
			typeInto(root.querySelector('#setup-name') as HTMLInputElement, 'Town hall');
			await vi.advanceTimersByTimeAsync(2000);
			m.redraw.sync();

			expect(mocks.api.createSession).toHaveBeenCalledWith({
				title: 'Town hall',
				mode: 'ranked',
			});
			expect(mocks.api.saveTopics).toHaveBeenCalledWith({
				sessionId: SESSION_ID,
				topics: [{ title: 'Parks' }],
			});
			expect(root.textContent).toContain(en['tableAssignment.autosave.saved']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not rewrite the address when the page was left before the session was created', async () => {
		let finishCreate: (value: { session: ReturnType<typeof makeSession> }) => void = () =>
			undefined;

		mocks.api.createSession.mockReturnValue(
			new Promise((resolve) => {
				finishCreate = resolve;
			}),
		);
		mocks.api.saveSettings.mockResolvedValue({ settings: {} });
		mocks.api.saveTopics.mockResolvedValue({ topicIds: [] });
		const replaceState = vi.spyOn(window.history, 'replaceState');

		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const { root } = await renderScreen(HostNew, {});

			typeInto(root.querySelector('#setup-name') as HTMLInputElement, 'Town hall');
			await vi.advanceTimersByTimeAsync(2000);
			expect(mocks.api.createSession).toHaveBeenCalled();

			m.mount(root, null);
			finishCreate({ session: makeSession() });
			await vi.advanceTimersByTimeAsync(2000);

			expect(replaceState).not.toHaveBeenCalled();
		} finally {
			replaceState.mockRestore();
			vi.useRealTimers();
		}
	});

	it('keeps unsaved edits in the backup when the server snapshot arrives during our own save', async () => {
		const session = makeSession({ lastUpdate: 1_000 });
		const scope = { uid: 'host-1', sessionId: SESSION_ID };
		let finishSave: (value: { topicIds: string[] }) => void = () => undefined;

		mocks.api.saveTopics.mockReturnValue(
			new Promise((resolve) => {
				finishSave = resolve;
			}),
		);
		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const root = document.createElement('div');
			const draw = (lastUpdate: number): void =>
				m.render(
					root,
					m(SetupBody, {
						uid: 'host-1',
						sessionId: SESSION_ID,
						session: { ...session, lastUpdate },
						topics: [makeTopic('a', 0)],
					}),
				);

			document.body.appendChild(root);
			draw(1_000);
			typeInto(root.querySelector('.setup__topic-input') as HTMLInputElement, 'Renamed');
			await vi.advanceTimersByTimeAsync(1000);
			expect(mocks.api.saveTopics).toHaveBeenCalled();

			// Our save is still in flight and the server's session snapshot arrives.
			draw(2_000);
			expect(readSetupBackup(window.localStorage, scope, 2_000)?.topics[0].title).toBe('Renamed');

			finishSave({ topicIds: ['a'] });
			await vi.advanceTimersByTimeAsync(10);
			m.render(root, null);
		} finally {
			vi.useRealTimers();
		}
	});

	it('opens a draft with its stored values and keeps explanations when saving', async () => {
		mocks.store.current.topics = [makeTopic('a', 0, { description: 'Keep me', maxTables: 2 })];
		mocks.api.saveTopics.mockResolvedValue({ topicIds: ['a'] });
		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const { root } = await renderScreen(HostHome, ID);
			const row = root.querySelector('.setup__topic-input') as HTMLInputElement;

			expect(row.value).toBe('Topic a');
			typeInto(row, 'Renamed');
			await vi.advanceTimersByTimeAsync(1000);

			expect(mocks.api.saveTopics).toHaveBeenCalledWith({
				sessionId: SESSION_ID,
				topics: [{ topicId: 'a', title: 'Renamed', description: 'Keep me', maxTables: 2 }],
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('switches between mix and sit, and hides the position question when sitting', async () => {
		const { root } = await renderScreen(HostHome, ID);

		expect(root.textContent).toContain(en['tableAssignment.setup.position.title']);
		buttonByTextStart(root, en['tableAssignment.mode.direct']).click();
		m.redraw.sync();
		expect(root.textContent).not.toContain(en['tableAssignment.setup.position.title']);
	});

	it('shows the failure honestly and keeps the text', async () => {
		mocks.api.saveSettings.mockRejectedValue({ code: 'functions/unavailable' });
		vi.useFakeTimers({ shouldAdvanceTime: true });

		try {
			const { root } = await renderScreen(HostHome, ID);
			const name = root.querySelector('#setup-name') as HTMLInputElement;

			typeInto(name, 'A better name');
			await vi.advanceTimersByTimeAsync(800);
			m.redraw.sync();

			expect(root.textContent).toContain(en['tableAssignment.autosave.failed']);
			expect(root.textContent).not.toContain(en['tableAssignment.autosave.saved']);
			expect(name.value).toBe('A better name');
		} finally {
			vi.useRealTimers();
		}
	});

	it('explains why registration cannot open yet', async () => {
		const { root, text } = await renderScreen(HostHome, ID);

		expect(text).toContain(en['tableAssignment.setup.problem.topics']);
		expect(buttonByText(root, en['tableAssignment.setup.open']).disabled).toBe(true);
	});

	it('saves everything before opening registration', async () => {
		mocks.store.current.topics = [makeTopic('a', 0)];
		mocks.api.saveTopics.mockResolvedValue({ topicIds: ['a'] });
		const { root } = await renderScreen(HostHome, ID);

		typeInto(root.querySelector('.setup__topic-input') as HTMLInputElement, 'Last edit');
		buttonByText(root, en['tableAssignment.setup.open']).click();
		await settle();

		const saved = mocks.api.saveTopics.mock.invocationCallOrder[0];
		const opened = mocks.api.setStatus.mock.invocationCallOrder[0];

		expect(saved).toBeLessThan(opened);
		expect(mocks.api.setStatus).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			status: 'registrationOpen',
		});
	});

	it('adds a pasted list on comma, Arabic comma and new line', async () => {
		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en['tableAssignment.setup.list']).click();
		m.redraw.sync();
		typeInto(root.querySelector('#setup-topic-list') as HTMLTextAreaElement, 'a, b،c\na');
		m.redraw.sync();
		buttonByText(root, 'Add 3 topics').click();
		m.redraw.sync();

		const rows = Array.from(root.querySelectorAll<HTMLInputElement>('.setup__topic-input'));

		expect(rows.map((row) => row.value)).toEqual(['a', 'b', 'c']);
	});

	it('marks the balanced chip by default and shows the number', async () => {
		const { root, text } = await renderScreen(HostNew, {});

		expect(
			buttonByText(root, en['tableAssignment.strictness.balanced']).getAttribute('aria-pressed'),
		).toBe('true');
		expect(text).toContain('0.30');
	});

	it('shows a stored custom tolerance with no chip chosen', async () => {
		mocks.store.current.session = makeSession({
			settings: {
				tableSize: 7,
				balanceTolerance: 0.2,
				positionQuestion: { label: 'Q', poleA: 'A', poleB: 'B' },
			},
		});

		const { root, text } = await renderScreen(HostHome, ID);

		expect(root.querySelector('.setup__chip[aria-pressed="true"]')).toBeNull();
		expect(text).toContain('0.20');
	});

	it('has return by name off by default, with its warning', async () => {
		const { text, root } = await renderScreen(HostHome, ID);
		const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

		expect(boxes[boxes.length - 1].checked).toBe(false);
		expect(text).toContain(en['tableAssignment.setup.return.warning']);
	});
});

describe('Registration open', () => {
	beforeEach(() => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.topics = [makeTopic('a', 0)];
		mocks.store.current.registeredCount = 22;
	});

	it('shows the count from the counter, the estimate and the real link', async () => {
		const { root, text } = await renderScreen(HostHome, ID);

		expect(root.querySelector('.live__number')?.textContent).toBe('22');
		expect(text).toContain('So far that is about 4 tables');
		expect(root.querySelector('.live__url')?.textContent).toBe(
			`tables.wizcol.com/sessions/${SESSION_ID}`,
		);
		expect(root.querySelector('img.live__qr')).not.toBeNull();
	});

	it('closes, computes and only then is done', async () => {
		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en['tableAssignment.live.close']).click();
		await settle();

		expect(mocks.api.setStatus).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			status: 'registrationClosed',
		});
		expect(mocks.api.computePreview).toHaveBeenCalledWith({ sessionId: SESSION_ID });
	});

	it('does not compute when closing was refused, and says so', async () => {
		mocks.api.setStatus.mockRejectedValue({ code: 'functions/failed-precondition' });
		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en['tableAssignment.live.close']).click();
		await settle();

		expect(mocks.api.computePreview).not.toHaveBeenCalled();
		expect(root.textContent).toContain(en['tableAssignment.error.statusRefused']);
	});

	it('in free mode closes without computing', async () => {
		mocks.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en['tableAssignment.control.registrationClosed']).click();
		await settle();

		expect(mocks.api.computePreview).not.toHaveBeenCalled();
	});
});

describe('Fix details', () => {
	beforeEach(() => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.topics = [makeTopic('a', 0), makeTopic('b', 1)];
	});

	async function openDialog(): Promise<HTMLElement> {
		const { root } = await renderScreen(HostHome, ID);

		buttonByText(root, en['tableAssignment.fixDetails']).click();
		m.redraw.sync();

		return root;
	}

	it('sends titles only, for every topic in order', async () => {
		const root = await openDialog();
		const inputs = root.querySelectorAll<HTMLInputElement>('.fix-details input');

		typeInto(inputs[0], 'New name');
		typeInto(inputs[2], 'Fixed b');
		m.redraw.sync();
		buttonByText(root, en['tableAssignment.save']).click();
		await settle();

		expect(mocks.api.fixDetails).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			title: 'New name',
			topics: [
				{ topicId: 'a', title: 'Topic a' },
				{ topicId: 'b', title: 'Fixed b' },
			],
		});
		expect(root.querySelector('.modal')).toBeNull();
	});

	it('cannot save an empty title', async () => {
		const root = await openDialog();

		typeInto(root.querySelector('.fix-details input') as HTMLInputElement, '  ');
		m.redraw.sync();

		expect(buttonByText(root, en['tableAssignment.save']).disabled).toBe(true);
	});

	it('keeps the text and shows a message when the save fails', async () => {
		mocks.api.fixDetails.mockRejectedValue({ code: 'functions/unavailable' });
		const root = await openDialog();
		const input = root.querySelector('.fix-details input') as HTMLInputElement;

		typeInto(input, 'New name');
		m.redraw.sync();
		buttonByText(root, en['tableAssignment.save']).click();
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.error.network']);
		expect(root.querySelector<HTMLInputElement>('.fix-details input')?.value).toBe('New name');
	});
});
