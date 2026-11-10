// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import en from '@/lib/locales/en';
import { ParticipantName } from '@/views/participant/ParticipantName';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { ParticipantPosition } from '@/views/participant/ParticipantPosition';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import { saveDraft } from '@/logic/localDraft';
import { participantScreenPath } from '@/paths';
import { makeParticipant, makeRosterEntry, makeSession, makeTopic, SESSION_ID } from '../fixtures';
import { renderScreen, unmountAll } from './testHarness';
import {
	buttonWithText,
	clickButton,
	DRAFT_KEY,
	HOME,
	ID,
	mocks,
	pressKey,
	registered,
	settle,
	submitForm,
	useParticipantScreens,
	WITH_QUESTION,
} from './participantMocks';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/tableAssignment/client', async () => ({
	tablesApi: (await import('./participantMocks')).mocks.api,
}));
vi.mock('@/lib/navigate', async () => {
	const { mocks } = await import('./participantMocks');

	return { goTo: mocks.goTo, replaceWith: mocks.replaceWith };
});
vi.mock('@/lib/auth', () => ({ ensureParticipantUser: async () => ({ uid: 'u1' }) }));
vi.mock('@/lib/tableAssignment/data', async () =>
	(await import('./participantMocks')).fakeDataModule(),
);

useParticipantScreens();

describe('editing: step 1 again', () => {
	it("shows the person's own name and continues to step 2", async () => {
		mocks.store.current.me = makeParticipant('u1', { fullName: 'Dana Levi' });
		mocks.api.register.mockResolvedValue({ outcome: 'registered' });

		const { root } = await renderScreen(ParticipantName, ID);

		expect(root.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Dana Levi');
		submitForm(root);
		await settle();

		expect(mocks.goTo).toHaveBeenCalledWith(participantScreenPath(SESSION_ID, 'preferences'));
	});

	it('goes home without a registration', async () => {
		await renderScreen(ParticipantName, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});
});

describe('rank topics', () => {
	beforeEach(registered);

	const rows = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.rank-row'));
	const picks = (root: HTMLElement) =>
		Array.from(root.querySelectorAll<HTMLButtonElement>('.rank-row__pick'));
	const firstRowTitle = (root: HTMLElement) => rows(root)[0].textContent ?? '';

	it('tells before ranking that a seat can be outside the choices', async () => {
		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain(en['tableAssignment.rank.note']);
	});

	it('raises picked topics to the top, in tap order, with no continue until one is picked', async () => {
		const { root } = await renderScreen(ParticipantPreferences, ID);

		expect(buttonWithText(root, en['tableAssignment.rank.pickOne'])?.disabled).toBe(true);
		picks(root)[1].click();
		await settle();
		picks(root)[2].click();
		await settle();

		expect(firstRowTitle(root)).toContain('Topic b');
		expect(rows(root)[1].textContent).toContain('Topic c');
		expect(rows(root)[0].querySelector('.rank-row__badge')?.textContent).toBe('1');
	});

	it('keeps the choices when opened again before saving', async () => {
		saveDraft(SESSION_ID, 'u1', { ranked: ['c'], position: null }, window.localStorage);

		const { root } = await renderScreen(ParticipantPreferences, ID);

		expect(firstRowTitle(root)).toContain('Topic c');
	});

	it("shows the person's own saved choices when editing", async () => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['c', 'a'] });

		const { root } = await renderScreen(ParticipantPreferences, ID);

		expect(firstRowTitle(root)).toContain('Topic c');
		expect(root.querySelectorAll('.rank-row--picked')).toHaveLength(2);
	});

	it('reorders with the arrow keys and announces the new place', async () => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a', 'b'] });

		const { root } = await renderScreen(ParticipantPreferences, ID);
		const handle = rows(root)[1].querySelector('.rank-row__handle');

		if (!handle) throw new Error('handle missing');
		pressKey(handle, 'ArrowUp');
		await settle();

		expect(firstRowTitle(root)).toContain('Topic b');
		expect(root.querySelector('[aria-live="polite"].visually-hidden')?.textContent).toContain(
			'Topic b is now in place 1',
		);
	});

	it('ignores an arrow key past the end', async () => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a', 'b'] });

		const { root } = await renderScreen(ParticipantPreferences, ID);
		const handle = rows(root)[0].querySelector('.rank-row__handle');

		if (!handle) throw new Error('handle missing');
		pressKey(handle, 'ArrowUp');
		await settle();

		expect(firstRowTitle(root)).toContain('Topic a');
	});

	it('drags with a pointer and commits the move on release', async () => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a', 'b'] });

		const { root } = await renderScreen(ParticipantPreferences, ID);
		const [first, second] = rows(root);

		first.getBoundingClientRect = () => ({ top: 0, height: 60 }) as DOMRect;
		second.getBoundingClientRect = () => ({ top: 70, height: 60 }) as DOMRect;

		const handle = first.querySelector('.rank-row__handle');

		if (!handle) throw new Error('handle missing');
		handle.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientY: 10, bubbles: true }));
		window.dispatchEvent(new MouseEvent('pointermove', { clientY: 80 }));
		await settle();

		expect(root.querySelector('.rank-row--dragging')).not.toBeNull();
		window.dispatchEvent(new MouseEvent('pointerup', { clientY: 80 }));
		await settle();

		expect(firstRowTitle(root)).toContain('Topic b');
		expect(root.querySelector('.rank-row--dragging')).toBeNull();
	});

	it('shows an explanation only on demand', async () => {
		mocks.store.current.topics = [makeTopic('a', 0, { description: 'Parks and trees' })];

		const { root, text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).not.toContain('Parks and trees');
		root.querySelector<HTMLButtonElement>('.rank-row__explain')?.click();
		await settle();

		expect(root.textContent).toContain('Parks and trees');
	});

	it('goes on to the position step without saving', async () => {
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: WITH_QUESTION,
		});

		const { root } = await renderScreen(ParticipantPreferences, ID);

		picks(root)[0].click();
		await settle();
		clickButton(root, en['tableAssignment.continue']);
		await settle();

		expect(mocks.api.savePreferences).not.toHaveBeenCalled();
		expect(mocks.goTo).toHaveBeenCalledWith(participantScreenPath(SESSION_ID, 'position'));
	});

	it('saves here when there is no position question', async () => {
		mocks.api.savePreferences.mockResolvedValue({});

		const { root } = await renderScreen(ParticipantPreferences, ID);

		picks(root)[1].click();
		await settle();
		clickButton(root, en['tableAssignment.save']);
		await settle();

		expect(mocks.api.savePreferences).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			preferences: ['b'],
		});
		expect(mocks.goTo).toHaveBeenCalledWith(HOME);
	});

	it('keeps the choices on this device when saving fails', async () => {
		mocks.api.savePreferences.mockRejectedValue({ code: 'functions/unavailable' });

		const { root } = await renderScreen(ParticipantPreferences, ID);

		picks(root)[0].click();
		await settle();
		clickButton(root, en['tableAssignment.save']);
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.choices.keptLocally']);
		expect(window.localStorage.getItem(DRAFT_KEY)).toContain('"a"');
	});

	it('goes home after registration closes or without a registration', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		await renderScreen(ParticipantPreferences, ID);
		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
		mocks.replaceWith.mockClear();
		unmountAll();

		mocks.store.current.session = makeSession({ status: 'registrationOpen' });
		mocks.store.current.me = null;
		await renderScreen(ParticipantPreferences, ID);
		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});
});

describe('my position', () => {
	beforeEach(() => {
		registered();
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: WITH_QUESTION,
		});
		saveDraft(SESSION_ID, 'u1', { ranked: ['a'], position: null }, window.localStorage);
	});

	const radios = (root: HTMLElement) =>
		Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
	const choose = (input: HTMLInputElement) => {
		input.checked = true;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	};

	it('has five stops plus "prefer not to answer", nothing chosen, and no save yet', async () => {
		const { root } = await renderScreen(ParticipantPosition, ID);

		expect(radios(root)).toHaveLength(6);
		expect(radios(root).some((radio) => radio.checked)).toBe(false);
		expect(buttonWithText(root, en['tableAssignment.position.pickOne'])?.disabled).toBe(true);
		expect(radios(root).map((radio) => radio.getAttribute('aria-label'))).toEqual([
			'Keep',
			'Leaning toward: Keep',
			'Between the two sides',
			'Leaning toward: Change',
			'Change',
			'Prefer not to answer',
		]);
	});

	it('saves the choices and the stop together, once', async () => {
		mocks.api.savePreferences.mockResolvedValue({});

		const { root } = await renderScreen(ParticipantPosition, ID);

		choose(radios(root)[3]);
		await settle();

		expect(root.textContent).toContain('You chose: Leaning toward: Change');
		clickButton(root, en['tableAssignment.save']);
		await settle();

		expect(mocks.api.savePreferences).toHaveBeenCalledTimes(1);
		expect(mocks.api.savePreferences).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			preferences: ['a'],
			position: 75,
		});
		expect(mocks.goTo).toHaveBeenCalledWith(HOME);
	});

	it('stores "prefer not to answer" as no value, never 50', async () => {
		mocks.api.savePreferences.mockResolvedValue({});

		const { root } = await renderScreen(ParticipantPosition, ID);

		choose(radios(root)[5]);
		await settle();
		clickButton(root, en['tableAssignment.save']);
		await settle();

		expect(mocks.api.savePreferences).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			preferences: ['a'],
		});
	});

	it('shows an older slider answer at its nearest stop when editing', async () => {
		window.localStorage.clear();
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'], position: 37 });

		const { root } = await renderScreen(ParticipantPosition, ID);

		expect(radios(root)[1].checked).toBe(true);
	});

	it('goes back to ranking when nothing was picked', async () => {
		window.localStorage.clear();

		await renderScreen(ParticipantPosition, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(
			participantScreenPath(SESSION_ID, 'preferences'),
		);
	});

	it('goes home when there is no question', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationOpen' });

		await renderScreen(ParticipantPosition, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});
});

describe('choose a table (free mode)', () => {
	beforeEach(() => {
		mocks.store.current.session = makeSession({ mode: 'direct', status: 'registrationOpen' });
		registered();
	});

	it('lists tables per topic and handles a full table', async () => {
		mocks.api.joinTable.mockRejectedValue({
			code: 'functions/failed-precondition',
			details: { reason: 'table-full' },
		});

		const { root, text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('Table 1');
		expect(text).toContain('Topic a');

		clickButton(root, en['tableAssignment.direct.sit']);
		await settle();

		expect(mocks.api.joinTable).toHaveBeenCalledWith({ sessionId: SESSION_ID, tableIndex: 0 });
		expect(root.textContent).toContain(en['tableAssignment.error.tableFull']);
	});

	it('shows free seats when occupancy is readable', async () => {
		mocks.store.current.everyone = [
			makeRosterEntry('u2', { chosenTableIndex: 0 }),
			makeRosterEntry('u3', { chosenTableIndex: 0 }),
		];

		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(text).toContain('5 seats free');
	});

	it('promises two steps', async () => {
		mocks.store.current.me = null;

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.home.stepsHint.2']);
		expect(text).toContain(en['tableAssignment.home.intro.direct']);
	});
});
