import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { createSession } from '../fn_tablesCreateSession';
import { register, registrationCap } from '../fn_tablesRegister';
import { savePreferences } from '../fn_tablesSavePreferences';
import { saveSettings } from '../fn_tablesSaveSettings';
import { saveTopics } from '../fn_tablesSaveTopics';
import { actorFrom } from '../tablesAccess';
import { requireTitle } from '../validation';
import {
	GOOGLE_HOST,
	HOST,
	NOW,
	SID,
	counterPath,
	expectRefusal,
	participantPath,
	rosterPath,
	seatPath,
	seedCounter,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

const NAME = 'Dana Levi';

describe('the registration cap', () => {
	it('is three times the expected number, within 200 and 2000', () => {
		expect(registrationCap(undefined)).toBe(200);
		expect(registrationCap(10)).toBe(200);
		expect(registrationCap(100)).toBe(300);
		expect(registrationCap(1000)).toBe(2000);
	});

	it('refuses a new registration at the cap, and writes nothing', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedCounter(fake, 200);
		await expectRefusal(
			register(fake.asFirestore(), 'new', { sessionId: SID, fullName: NAME }),
			'failed-precondition',
			'registration-full',
		);
		expect(fake.read(participantPath('new'))).toBeUndefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 200 });
	});

	it('lets the last one in, just under the cap', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedCounter(fake, 199);
		await expect(
			register(fake.asFirestore(), 'new', { sessionId: SID, fullName: NAME }),
		).resolves.toMatchObject({ outcome: 'registered' });
	});

	it('follows what the host expects', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, {}, { expectedParticipants: 100 });
		seedCounter(fake, 250);
		await expect(
			register(fake.asFirestore(), 'new', { sessionId: SID, fullName: NAME }),
		).resolves.toMatchObject({ outcome: 'registered' });
	});

	it('never refuses someone already registered', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedRegistration(fake, 'u1', { fullName: 'Old Name' });
		seedCounter(fake, 500);
		await expect(
			register(fake.asFirestore(), 'u1', { sessionId: SID, fullName: NAME }),
		).resolves.toMatchObject({ participant: { fullName: NAME } });
		expect(fake.read(counterPath)).toMatchObject({ registered: 500 });
	});

	it('still lets a claim through, which adds nobody', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, {}, { allowReturnByName: true });
		seedRegistration(fake, 'old', { fullName: NAME });
		seedCounter(fake, 200);
		await expect(
			register(fake.asFirestore(), 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' }),
		).resolves.toMatchObject({ participant: { claimedByName: true } });
	});

	it('reads the count outside the transaction, to keep the increment free of contention', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		const fs = fake.asFirestore();
		const original = fs.runTransaction.bind(fs);
		const reads: unknown[] = [];

		fs.runTransaction = ((fn: Parameters<typeof original>[0]) =>
			original((tx) => {
				const get = tx.get.bind(tx) as (target: { path?: string }) => unknown;

				(tx as unknown as { get: unknown }).get = (target: { path?: string }) => {
					reads.push(target.path);

					return get(target);
				};

				return fn(tx);
			})) as typeof fs.runTransaction;
		await register(fs, 'new', { sessionId: SID, fullName: NAME }, NOW);
		expect(reads).not.toContain(counterPath);
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});
});

describe('limits on what a host can set', () => {
	it('refuses a topic asking for more than 50 tables', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'draft' });
		const fs = fake.asFirestore();

		await expectRefusal(
			saveTopics(fs, HOST, { sessionId: SID, topics: [{ title: 'A', maxTables: 51 }] }),
			'invalid-argument',
		);
		await expect(
			saveTopics(fs, HOST, { sessionId: SID, topics: [{ title: 'A', maxTables: 50 }] }),
		).resolves.toBeDefined();
	});

	it('refuses a table of two for a new session', async () => {
		const fake = new FakeFirestore();

		await expectRefusal(
			createSession(fake.asFirestore(), GOOGLE_HOST, {
				title: 'T',
				mode: 'ranked',
				settings: { tableSize: 2 },
			}),
			'invalid-argument',
		);
		expect(fake.list('tableAssignments')).toHaveLength(0);
	});

	it('refuses moving a session to a table of two', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'draft' }, { tableSize: 5 });
		await expectRefusal(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, tableSize: 2 }),
			'invalid-argument',
		);
	});

	it('leaves an older session with a table of two able to save its other settings', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'draft' }, { tableSize: 2 });
		await expect(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, tableSize: 2, title: 'New' }),
		).resolves.toMatchObject({ settings: { tableSize: 2 } });
	});

	it.each([0, 25, 50, 75, 100])('accepts the stop %d', async (position) => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedTopics(fake, ['a']);
		seedRegistration(fake, 'u1');
		await expect(
			savePreferences(fake.asFirestore(), 'u1', { sessionId: SID, preferences: ['a'], position }),
		).resolves.toMatchObject({ participant: { position } });
	});

	it.each([1, 37, 99, 101, -25, 25.5, Number.NaN, '50'])('refuses the position %s', async (bad) => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedTopics(fake, ['a']);
		seedRegistration(fake, 'u1');
		await expectRefusal(
			savePreferences(fake.asFirestore(), 'u1', {
				sessionId: SID,
				preferences: ['a'],
				position: bad as number,
			}),
			'invalid-argument',
		);
	});
});

describe('who may host', () => {
	const request = (provider: string | undefined): Parameters<typeof actorFrom>[0] =>
		({
			auth: { uid: 'u', token: { firebase: { sign_in_provider: provider } } },
		}) as unknown as Parameters<typeof actorFrom>[0];

	it.each(['anonymous', 'password', 'custom', undefined])('refuses %s', async (signInProvider) => {
		const fake = new FakeFirestore();

		await expectRefusal(
			createSession(
				fake.asFirestore(),
				{ uid: 'u', signInProvider },
				{ title: 'T', mode: 'direct' },
			),
			'permission-denied',
		);
		expect(fake.list('tableAssignments')).toHaveLength(0);
	});

	it('accepts a Google account, read from the token', async () => {
		const fake = new FakeFirestore();

		await expect(
			createSession(fake.asFirestore(), actorFrom(request('google.com')), {
				title: 'T',
				mode: 'direct',
			}),
		).resolves.toBeDefined();
	});
});

describe('names', () => {
	it('allows a rename while registration is open', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		seedRegistration(fake, 'u1', { fullName: 'Old Name' });
		await expect(
			register(fake.asFirestore(), 'u1', { sessionId: SID, fullName: NAME }),
		).resolves.toMatchObject({ participant: { fullName: NAME } });
	});

	it('refuses a rename once published, and keeps the name', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'published', publishedRunId: 'r' });
		seedRegistration(fake, 'u1', { fullName: 'Old Name' });
		await expectRefusal(
			register(fake.asFirestore(), 'u1', { sessionId: SID, fullName: NAME }),
			'failed-precondition',
			'name-locked',
		);
		expect(fake.read(rosterPath('u1'))).toMatchObject({ fullName: 'Old Name' });
	});

	it('lets someone send their own name again once published', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'published', publishedRunId: 'r' });
		seedRegistration(fake, 'u1', { fullName: NAME });
		await expect(
			register(fake.asFirestore(), 'u1', { sessionId: SID, fullName: ' dana  levi ' }),
		).resolves.toMatchObject({ participant: { fullName: NAME } });
	});

	it('still lets a latecomer register once published', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, { status: 'published', publishedRunId: 'r' });
		await expect(
			register(fake.asFirestore(), 'late', { sessionId: SID, fullName: NAME }),
		).resolves.toMatchObject({ outcome: 'registered' });
	});

	it.each([
		['a right-to-left override', 'Dana‮ Levi', 'Dana Levi'],
		['bidi isolates', '⁦Dana⁩ Levi', 'Dana Levi'],
		['a null byte', 'Dana\u0000 Levi', 'Dana Levi'],
		['a zero-width space', 'Da​na Levi', 'Dana Levi'],
		['a line break, as a space', 'Dana\nLevi', 'Dana Levi'],
	])('strips %s from a full name', async (_label, raw, clean) => {
		const fake = new FakeFirestore();

		seedSession(fake);
		const { participant } = await register(fake.asFirestore(), 'u1', {
			sessionId: SID,
			fullName: raw,
		});

		expect(participant?.fullName).toBe(clean);
		expect(fake.read(rosterPath('u1'))).toMatchObject({ nameKey: 'dana levi' });
	});

	it('keeps Hebrew and Arabic as they are', () => {
		expect(requireTitle('דנה לוי', 'title')).toBe('דנה לוי');
		expect(requireTitle('دانا ليفي', 'title')).toBe('دانا ليفي');
	});

	it('measures a name after stripping, so invisible characters cannot pass for one', async () => {
		const fake = new FakeFirestore();

		seedSession(fake);
		await expectRefusal(
			register(fake.asFirestore(), 'u1', { sessionId: SID, fullName: 'a​‮⁦' }),
			'invalid-argument',
		);
	});

	it('strips the same from a title', () => {
		expect(requireTitle('Town‮ hall', 'title')).toBe('Town hall');
	});

	it('matches a namesake through invisible characters', async () => {
		const fake = new FakeFirestore();

		seedSession(fake, {}, { allowReturnByName: true });
		seedRegistration(fake, 'old', { fullName: NAME });
		seedCounter(fake, 1);
		await expect(
			register(fake.asFirestore(), 'new', { sessionId: SID, fullName: 'Da​na Levi' }, NOW),
		).resolves.toEqual({ outcome: 'nameExists' });
	});
});

describe('return by name', () => {
	const RETURN_BY_NAME = { allowReturnByName: true };

	function sessionWithNamesake(): FakeFirestore {
		const fake = new FakeFirestore();

		seedSession(fake, {}, RETURN_BY_NAME);
		seedTopics(fake, ['a']);
		seedRegistration(fake, 'old', { fullName: NAME, preferences: ['a'], position: 75 });
		seedCounter(fake, 1);

		return fake;
	}

	it('hands the direct-mode seat to the claimant: the seat count does not move', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct' }, RETURN_BY_NAME);
		seedRegistration(fake, 'old', {
			fullName: NAME,
			chosenTableIndex: 0,
			preferences: ['a'],
			position: 75,
		});
		seedCounter(fake, 1);
		fake.seed(seatPath(0), { sessionId: SID, tableIndex: 0, topicId: 'a', count: 1 });
		const result = await register(fake.asFirestore(), 'new', {
			sessionId: SID,
			fullName: NAME,
			nameMatch: 'claim',
		});
		expect(fake.read(seatPath(0))).toMatchObject({ count: 1 });
		expect(result.participant).toMatchObject({ chosenTableIndex: 0, preferences: [] });
		expect(result.participant).not.toHaveProperty('position');
		expect(fake.read(rosterPath('new'))).toMatchObject({ chosenTableIndex: 0 });
		expect(fake.read(participantPath('old'))).toBeUndefined();
		expect(fake.read(counterPath)).toMatchObject({ registered: 1 });
	});

	it('refuses to rename a registration taken over by name', async () => {
		const fake = sessionWithNamesake();
		const fs = fake.asFirestore();
		await register(fs, 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' });
		await expectRefusal(
			register(fs, 'new', { sessionId: SID, fullName: 'Dana L.' }),
			'failed-precondition',
			'claimed-by-name',
		);
		expect(fake.read(participantPath('new'))).toMatchObject({ fullName: NAME });
	});

	it('lets a taken-over registration send its own name again', async () => {
		const fake = sessionWithNamesake();
		const fs = fake.asFirestore();
		await register(fs, 'new', { sessionId: SID, fullName: NAME, nameMatch: 'claim' });
		await expect(
			register(fs, 'new', { sessionId: SID, fullName: '  dana  LEVI' }),
		).resolves.toMatchObject({
			outcome: 'registered',
			participant: { fullName: NAME },
		});
	});
});
