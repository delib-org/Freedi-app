// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/lib/locales/en';
import { ParticipantHome } from '@/views/participant/ParticipantHome';
import { ParticipantPreferences } from '@/views/participant/ParticipantPreferences';
import { participantScreenPath } from '@/paths';
import { makeParticipant, makeRun, makeSession, SESSION_ID } from '../fixtures';
import { renderScreen } from './testHarness';
import { HOME, ID, mocks, useParticipantScreens } from './participantMocks';

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

/** Tables published for u2 and u3 only; u1 is the latecomer unless the test says otherwise. */
function publishedWithoutMe(): void {
	mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
	mocks.store.current.run = makeRun({
		status: 'published',
		tables: [
			{
				index: 0,
				topicId: 'a',
				memberUids: ['u2', 'u3'],
				stats: { n: 0, mean: [], sd: [], deviation: 0 },
			},
		],
	});
}

describe('a latecomer after the tables are published', () => {
	it('can register: the name form is shown, not "registration is closed"', async () => {
		publishedWithoutMe();

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(root.querySelector('input[name="name"]')).not.toBeNull();
		expect(text).not.toContain(en['tableAssignment.stage.closedNotRegistered']);
	});

	it('registration that is closed stays closed', async () => {
		mocks.store.current.session = makeSession({ status: 'registrationClosed' });

		const { text, root } = await renderScreen(ParticipantHome, ID);

		expect(root.querySelector('input[name="name"]')).toBeNull();
		expect(text).toContain(en['tableAssignment.stage.closedNotRegistered']);
	});

	it('goes through the choices first, with no table to show', async () => {
		publishedWithoutMe();
		mocks.store.current.me = makeParticipant('u1', { preferences: [] });

		const { root } = await renderScreen(ParticipantHome, ID);

		expect(mocks.replaceWith).not.toHaveBeenCalled();
		expect(root.textContent).toContain(en['tableAssignment.waiting.unfinished.button.ranked']);
	});

	it('then sees that the host will seat them', async () => {
		publishedWithoutMe();
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a', 'b'] });

		const { text } = await renderScreen(ParticipantHome, ID);

		expect(text).toContain(en['tableAssignment.waiting.late.lead']);
		expect(text).toContain(en['tableAssignment.waiting.late.note']);
		expect(text).not.toContain(en['tableAssignment.waiting.step.closing']);
		expect(mocks.replaceWith).not.toHaveBeenCalled();
	});

	it('may still change their choices', async () => {
		publishedWithoutMe();
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'] });

		const { text } = await renderScreen(ParticipantPreferences, ID);

		expect(mocks.replaceWith).not.toHaveBeenCalledWith(HOME);
		expect(text).toContain('Topic b');
	});
});

describe('a person who is seated in the published run', () => {
	function seated(): void {
		mocks.store.current.session = makeSession({ status: 'published', publishedRunId: 'run-1' });
		mocks.store.current.run = makeRun({ status: 'published' });
		mocks.store.current.me = makeParticipant('u1', { preferences: ['a'] });
	}

	it('keeps the flow they had: straight to their table', async () => {
		seated();

		await renderScreen(ParticipantHome, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(participantScreenPath(SESSION_ID, 'my-table'));
	});

	it('cannot change their choices any more', async () => {
		seated();

		await renderScreen(ParticipantPreferences, ID);

		expect(mocks.replaceWith).toHaveBeenCalledWith(HOME);
	});
});
