// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { markCancelledHere, rememberRegistration } from '@/logic/localDraft';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { makeParticipant, makeSession, SESSION_ID } from '../fixtures';
import { renderScreen } from './testHarness';
import {
	buttonWithText,
	clickButton,
	ID,
	mocks,
	registered,
	settle,
	useParticipantScreens,
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

const AGAIN = en['tableAssignment.cancelled.again'];
const RETURN_BY_NAME = { tableSize: 7, balanceTolerance: 0.3, allowReturnByName: true };

function heldRegistrationGone(): void {
	mocks.store.current.me = null;
	rememberRegistration(SESSION_ID, 'u1', 'Dana Levi', window.localStorage);
}

function cancelledHere(): void {
	heldRegistrationGone();
	markCancelledHere(SESSION_ID, 'u1', window.localStorage);
}

describe('the cancelled screen', () => {
	it('while registration is open, says one can register again and offers it', async () => {
		cancelledHere();

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.cancelled.body']);
		expect(buttonWithText(root, AGAIN)).toBeDefined();
	});

	it.each(['registrationClosed', 'published'] as const)(
		'in %s, points to the host and makes no offer to register again',
		async (status) => {
			mocks.store.current.session = makeSession({ status, publishedRunId: 'run-1' });
			cancelledHere();

			const { text, root } = await renderScreen(ParticipantHome, ID);

			expect(text).toContain(en['tableAssignment.cancelled.title']);
			expect(text).toContain(en['tableAssignment.cancelled.bodyClosed']);
			expect(text).not.toContain(en['tableAssignment.cancelled.body']);
			expect(root.querySelectorAll('button.btn--cta')).toHaveLength(0);
		},
	);
});

describe('a registration this browser did not cancel', () => {
	it('says the host removed it, not that the person cancelled', async () => {
		heldRegistrationGone();

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.removed.title']);
		expect(text).toContain(en['tableAssignment.removed.body']);
		expect(text).not.toContain(en['tableAssignment.cancelled.title']);
	});

	it('offers to register again while open, and brings the name back', async () => {
		heldRegistrationGone();

		const { root } = await renderScreen(ParticipantHome, ID);

		clickButton(root, AGAIN);
		await settle();

		expect(root.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Dana Levi');
	});

	it('makes no offer after closing', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });
		heldRegistrationGone();

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.removed.title']);
		expect(buttonWithText(root, AGAIN)).toBeUndefined();
	});

	it('with return by full name on, does not claim the host did it', async () => {
		mocks.store.current.session = makeSession({
			status: 'registrationOpen',
			settings: RETURN_BY_NAME,
		});
		heldRegistrationGone();

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.removed.titleMaybeMoved']);
		expect(text).toContain(en['tableAssignment.removed.bodyMaybeMoved']);
		expect(text).not.toContain(en['tableAssignment.removed.body']);
		expect(buttonWithText(root, AGAIN)).toBeDefined();
	});

	it('flips to the removed screen while the person is watching', async () => {
		registered();

		const { root } = await renderScreen(ParticipantHome, ID);

		mocks.pushMyRecord(null);
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.removed.title']);
	});
});

describe('cancelling from this browser', () => {
	async function confirmCancel(root: HTMLElement): Promise<void> {
		clickButton(root, en['tableAssignment.cancelParticipation']);
		await settle();
		clickButton(root, en['tableAssignment.cancel.confirm']);
		await settle();
	}

	it('reads as cancelled even when the record goes before the server answers', async () => {
		mocks.api.cancelRegistration.mockReturnValue(new Promise(() => undefined));
		registered();

		const { root } = await renderScreen(ParticipantHome, ID);

		await confirmCancel(root);
		mocks.pushMyRecord(null);
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.cancelled.title']);
		expect(root.textContent).not.toContain(en['tableAssignment.removed.title']);
	});

	it('after a failed cancel, a later removal still reads as removed', async () => {
		mocks.api.cancelRegistration.mockRejectedValue({ code: 'functions/unavailable' });
		mocks.store.current.me = makeParticipant('u1');

		const { root } = await renderScreen(ParticipantHome, ID);

		await confirmCancel(root);
		mocks.pushMyRecord(null);
		await settle();

		expect(root.textContent).toContain(en['tableAssignment.removed.title']);
	});
});
