// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import en from '@/lib/locales/en';
import { ParticipantHome, LegacyTopicsRedirect } from '@/views/participant/ParticipantHome';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import { markCancelledHere, rememberRegistration } from '@/logic/localDraft';
import { participantScreenPath } from '@/paths';
import { makeParticipant, makeSession, SESSION_ID } from '../fixtures';
import { renderScreen } from './testHarness';
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
	typeName,
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

describe('the assignment link: step 1', () => {
	it('shows the gathering, the count, an honest step count and an empty name field', async () => {
		mocks.store.current.registeredCount = 42;

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain('Town hall');
		expect(text).toContain('42 people are already here');
		expect(text).toContain(en['tableAssignment.home.stepsHint.2']);
		expect(root.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('');
	});

	it('hides the count before anyone registered', async () => {
		const { root } = await renderScreen(ParticipantHome, ID);

		expect(root.querySelector('.pill')).toBeNull();
	});

	it('promises three steps when a position question exists', async () => {
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: WITH_QUESTION,
		});

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.home.stepsHint.3']);
	});

	it('registers with the trimmed full name and asks about namesakes', async () => {
		mocks.api.register.mockResolvedValue({ outcome: 'registered' });

		const { root } = await renderScreen(ParticipantHome, ID);

		typeName(root, '  Dana Levi ');
		await settle();
		submitForm(root);
		await settle();

		expect(mocks.api.register).toHaveBeenCalledWith({
			sessionId: SESSION_ID,
			fullName: 'Dana Levi',
			nameMatch: 'ask',
		});
	});

	it('moves to step 2 only once the record has arrived, keeping home in the history', async () => {
		mocks.api.register.mockResolvedValue({ outcome: 'registered' });

		const { root } = await renderScreen(ParticipantHome, ID);

		typeName(root, 'Dana');
		submitForm(root);
		await settle();

		expect(mocks.goTo).not.toHaveBeenCalled();
		mocks.pushMyRecord(makeParticipant('u1'));
		await settle();

		expect(mocks.goTo).toHaveBeenCalledWith(participantScreenPath(SESSION_ID, 'preferences'));
	});

	it('says registration is not open in a draft, without reading the topics', async () => {
		mocks.store.current.session = makeSession({ status: 'draft' });
		mocks.store.current.failTopicsWith = 'permission-denied';

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.notOpen.title']);
		expect(text).toContain('Town hall');
	});

	it('tells a latecomer that registration is closed', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.stage.closedNotRegistered']);
	});

	it('says the assignment ended', async () => {
		mocks.store.current.session = makeSession({ status: 'ended' });
		registered();

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.stage.ended']);
	});

	it('shows the error state with retry', async () => {
		mocks.store.current.failWith = 'unavailable';

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.state.error']);
		expect(text).toContain(en['tableAssignment.retry']);
	});

	it('shows no permission when reads are denied', async () => {
		mocks.store.current.failWith = 'permission-denied';

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.state.denied']);
	});

	it('forwards a registered person to My table once tables are published', async () => {
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		registered();

		await renderScreen(ParticipantHome, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(participantScreenPath(SESSION_ID, 'my-table'));
	});
});

describe('is this you?', () => {
	beforeEach(() => {
		mocks.api.register.mockResolvedValueOnce({ outcome: 'nameExists' });
	});

	async function openDialog(): Promise<HTMLElement> {
		const { root } = await renderScreen(ParticipantHome, ID);

		typeName(root, 'Dana Levi');
		submitForm(root);
		await settle();

		return root;
	}

	it('opens with the name, as an accessible dialog, with focus inside', async () => {
		const root = await openDialog();
		const dialog = root.querySelector<HTMLElement>('[role="dialog"]');

		expect(dialog?.getAttribute('aria-modal')).toBe('true');
		expect(dialog?.textContent).toContain('Dana Levi');
		expect(dialog?.contains(document.activeElement)).toBe(true);
	});

	it('"yes" claims the registration and clears anything kept on this device', async () => {
		mocks.api.register.mockResolvedValueOnce({ outcome: 'registered' });
		window.localStorage.setItem(DRAFT_KEY, '{"ranked":["a"],"position":25}');

		const root = await openDialog();

		clickButton(root, en['tableAssignment.returnByName.yes']);
		await settle();

		expect(mocks.api.register).toHaveBeenLastCalledWith({
			sessionId: SESSION_ID,
			fullName: 'Dana Levi',
			nameMatch: 'claim',
		});
		expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
		expect(root.querySelector('[role="dialog"]')).toBeNull();
	});

	it('"no" makes a new registration', async () => {
		mocks.api.register.mockResolvedValueOnce({ outcome: 'registered' });

		const root = await openDialog();

		clickButton(root, en['tableAssignment.returnByName.no']);
		await settle();

		expect(mocks.api.register).toHaveBeenLastCalledWith({
			sessionId: SESSION_ID,
			fullName: 'Dana Levi',
			nameMatch: 'separate',
		});
	});

	it('closes on Escape and leaves the name in the form', async () => {
		const root = await openDialog();

		pressKey(document.body, 'Escape');
		await settle();

		expect(root.querySelector('[role="dialog"]')).toBeNull();
		expect(root.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Dana Levi');
	});

	it('the claimant starts with an empty ranking', async () => {
		mocks.store.current.me = makeParticipant('u1', { claimedByName: true });

		const { root } = await renderScreen(ParticipantPreferences, ID);

		expect(root.querySelectorAll('.rank-row--picked')).toHaveLength(0);
	});
});

describe('waiting', () => {
	beforeEach(() => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['b', 'a'], position: 25 });
	});

	it('shows the saved choices, in order, and offers edit and cancel', async () => {
		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain('Saved. Thank you, Name');
		expect(root.querySelectorAll('.waiting__choice')[0].textContent).toContain('Topic b');
		expect(text).toContain(en['tableAssignment.editDetails']);
		expect(text).toContain(en['tableAssignment.cancelParticipation']);
	});

	it('hides cancel, but keeps edit, on a registration continued by name', async () => {
		mocks.store.current.me = makeParticipant('u1', {
			preferences: ['a'],
			claimedByName: true,
		});

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).not.toContain(en['tableAssignment.cancelParticipation']);
		expect(text).toContain(en['tableAssignment.editDetails']);
	});

	it('after closing has neither edit nor cancel, and points to the host', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).not.toContain(en['tableAssignment.editDetails']);
		expect(text).not.toContain(en['tableAssignment.cancelParticipation']);
		expect(text).toContain(en['tableAssignment.waiting.closedNote']);
	});

	it('prompts to finish the steps when registered without answers', async () => {
		registered();

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.waiting.unfinished.button.ranked']);
	});

	it('never shows the position value itself', async () => {
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: WITH_QUESTION,
		});

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.waiting.positionAnswered']);
		expect(text).not.toContain('Keep');
	});
});

describe('cancel participation', () => {
	beforeEach(() => {
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'] });
	});

	it('asks first, keeps the person on "stay", returns focus and closes', async () => {
		const { root } = await renderScreen(ParticipantHome, ID);
		const opener = buttonWithText(root, en['tableAssignment.cancelParticipation']);

		opener?.focus();
		opener?.click();
		await settle();

		expect(root.querySelector('[role="dialog"]')?.textContent).toContain(
			en['tableAssignment.cancel.title'],
		);
		clickButton(root, en['tableAssignment.cancel.stay']);
		await settle();

		expect(mocks.api.cancelRegistration).not.toHaveBeenCalled();
		expect(root.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement?.textContent).toBe(en['tableAssignment.cancelParticipation']);
	});

	it('keeps Tab inside the dialog', async () => {
		const { root } = await renderScreen(ParticipantHome, ID);

		clickButton(root, en['tableAssignment.cancelParticipation']);
		await settle();

		const buttons = root.querySelectorAll<HTMLButtonElement>('.modal__dialog button');
		const last = buttons[buttons.length - 1];

		last.focus();

		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

		document.dispatchEvent(tab);

		expect(tab.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(buttons[0]);
	});

	it('cancels on the second button', async () => {
		mocks.api.cancelRegistration.mockResolvedValue({ cancelled: true });

		const { root } = await renderScreen(ParticipantHome, ID);

		clickButton(root, en['tableAssignment.cancelParticipation']);
		await settle();
		clickButton(root, en['tableAssignment.cancel.confirm']);
		await settle();

		expect(mocks.api.cancelRegistration).toHaveBeenCalledWith({ sessionId: SESSION_ID });

		mocks.pushMyRecord(null);
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.cancelled.title']);
		expect(root.querySelector('[role="dialog"]')).toBeNull();
	});

	it('shows the cancelled screen when the record is gone, and "register again" starts with no stored name', async () => {
		mocks.store.current.me = null;
		rememberRegistration(SESSION_ID, 'u1', 'Dana Levi', window.localStorage);
		markCancelledHere(SESSION_ID, 'u1', window.localStorage);

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.cancelled.title']);
		clickButton(root, en['tableAssignment.cancelled.again']);
		await settle();

		expect(root.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('');
	});

	it('offers no "register again" after closing', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		mocks.store.current.me = null;
		rememberRegistration(SESSION_ID, 'u1', 'Dana', window.localStorage);
		markCancelledHere(SESSION_ID, 'u1', window.localStorage);

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.cancelled.title']);
		expect(text).not.toContain(en['tableAssignment.cancelled.again']);
	});
});

describe('old links', () => {
	it('send the topic pages to the assignment link', async () => {
		await renderScreen(LegacyTopicsRedirect, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});
});

describe('the accessibility tool', () => {
	it('opens from every screen, moves focus in, closes on Escape and returns focus', async () => {
		const { root } = await renderScreen(ParticipantHome, ID);
		const trigger = root.querySelector<HTMLButtonElement>('.a11y__trigger');

		trigger?.focus();
		trigger?.click();
		await settle();

		const panel = root.querySelector('.a11y__panel');

		expect(trigger?.getAttribute('aria-expanded')).toBe('true');
		expect(panel?.contains(document.activeElement)).toBe(true);

		pressKey(document.body, 'Escape');
		await settle();

		expect(root.querySelector('.a11y__panel')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('applies a theme, contrast and text size at once', async () => {
		const { root } = await renderScreen(ParticipantHome, ID);

		root.querySelector<HTMLButtonElement>('.a11y__trigger')?.click();
		await settle();
		clickButton(root, en['tableAssignment.a11y.theme.dark']);
		root.querySelector<HTMLButtonElement>('[role="switch"]')?.click();
		await settle();

		expect(document.documentElement.dataset.theme).toBe('dark');
		expect(document.documentElement.dataset.contrast).toBe('high');
		expect(root.querySelector<HTMLImageElement>('.shell__logo')?.src).toContain('logo-dark');

		clickButton(root, en['tableAssignment.a11y.reset']);
		await settle();

		expect(document.documentElement.dataset.contrast).toBe('normal');
		expect(root.querySelector<HTMLImageElement>('.shell__logo')?.src).not.toContain('logo-dark');
	});
});
