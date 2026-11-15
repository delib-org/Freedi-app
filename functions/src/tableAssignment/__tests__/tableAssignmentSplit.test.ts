import type {
	TableAssignment,
	TableAssignmentRun,
	TableAssignmentTopic,
	TablesSetStatusResponse,
} from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { createSession } from '../fn_tablesCreateSession';
import { joinTable } from '../fn_tablesJoinTable';
import { saveSettings } from '../fn_tablesSaveSettings';
import { saveTopics } from '../fn_tablesSaveTopics';
import { savePreferences } from '../fn_tablesSavePreferences';
import { setStatus } from '../fn_tablesSetStatus';
import { fixDetails } from '../fn_tablesFixDetails';
import { cancelRegistration } from '../fn_tablesCancelRegistration';
import {
	GOOGLE_HOST,
	HOST,
	NOW,
	SID,
	expectRefusal,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

/**
 * "Sit where you like" with tables made by the system and the one-topic event
 * (IA tables-class-bridge 2.1, 2.3, 2.4).
 */

const topicPath = (topicId: string): string => `tableAssignmentTopics/${topicId}`;
const chosen = (fake: FakeFirestore, topicId: string): number | undefined =>
	(fake.read(topicPath(topicId)) as TableAssignmentTopic | undefined)?.chosenCount;

function splitRoom(tableSize = 7): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, { mode: 'direct', splitByTopic: true }, { tableSize });
	seedTopics(fake, ['a', 'b', 'c']);

	return fake;
}

/** `count` people who chose `topicId`, seeded as saved (counts included). */
function seedChoosers(fake: FakeFirestore, topicId: string, count: number, from = 0): string[] {
	const uids = Array.from({ length: count }, (_, i) => `${topicId}${from + i}`);
	uids.forEach((uid) => seedRegistration(fake, uid, { preferences: [topicId] }));
	const topic = fake.read(topicPath(topicId)) as TableAssignmentTopic;
	fake.seed(topicPath(topicId), { ...topic, chosenCount: (topic.chosenCount ?? 0) + count });

	return uids;
}

function sessionOf(fake: FakeFirestore): TableAssignment {
	return fake.read(`tableAssignments/${SID}`) as TableAssignment;
}

function publishedRun(fake: FakeFirestore): TableAssignmentRun {
	return fake.read(`tableAssignmentRuns/${sessionOf(fake).publishedRunId}`) as TableAssignmentRun;
}

async function close(fake: FakeFirestore): Promise<TablesSetStatusResponse> {
	return setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'registrationClosed' }, NOW);
}

describe('creating a session', () => {
	it('marks every new session splitByTopic', async () => {
		const fake = new FakeFirestore();
		const { session } = await createSession(fake.asFirestore(), GOOGLE_HOST, {
			title: 'Evening',
			mode: 'direct',
		});

		expect(session.splitByTopic).toBe(true);
		expect(fake.list('tableAssignmentTopics')).toEqual([]);
	});

	it('gives a one-topic session its single topic, named after it, in ranked mode', async () => {
		const fake = new FakeFirestore();
		const { session } = await createSession(fake.asFirestore(), GOOGLE_HOST, {
			title: 'Evening',
			mode: 'direct',
			settings: { topicCount: 'one' },
		});

		expect(session.mode).toBe('ranked');
		expect(fake.list('tableAssignmentTopics')).toEqual([
			expect.objectContaining({ sessionId: session.tableAssignmentId, title: 'Evening', order: 0 }),
		]);
	});

	it('refuses an unknown topic count', async () => {
		await expectRefusal(
			createSession(new FakeFirestore().asFirestore(), GOOGLE_HOST, {
				title: 'Evening',
				mode: 'ranked',
				settings: { topicCount: 'many' },
			}),
			'invalid-argument',
		);
	});
});

describe('the topic count in a draft', () => {
	function draft(): FakeFirestore {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft', mode: 'direct', splitByTopic: true });
		seedTopics(fake, ['a', 'b']);

		return fake;
	}

	it('turns the topics into one topic named after the session, and the mode into ranked', async () => {
		const fake = draft();
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, topicCount: 'one' }, NOW);

		expect(sessionOf(fake).mode).toBe('ranked');
		expect(sessionOf(fake).settings.topicCount).toBe('one');
		expect(fake.list('tableAssignmentTopics')).toEqual([
			{ topicId: 'a', sessionId: SID, title: 'Town hall', order: 0 },
		]);
	});

	it('renames the one topic with the session', async () => {
		const fake = draft();
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, topicCount: 'one' }, NOW);
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, title: 'Picnic' }, NOW);

		expect(fake.read(topicPath('a'))).toMatchObject({ title: 'Picnic' });
	});

	it('refuses direct mode and a topic list for a one-topic session', async () => {
		const fake = draft();
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, topicCount: 'one' }, NOW);

		await expectRefusal(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, mode: 'direct' }, NOW),
			'failed-precondition',
			'one-topic',
		);
		await expectRefusal(
			saveTopics(fake.asFirestore(), HOST, { sessionId: SID, topics: [{ title: 'x' }] }),
			'failed-precondition',
			'one-topic',
		);
	});

	it('is fixed once registration opens', async () => {
		const fake = splitRoom();
		await expectRefusal(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, topicCount: 'one' }, NOW),
			'failed-precondition',
		);
	});

	it('follows a fixed event title onto the one topic after opening', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, {}, { topicCount: 'one' });
		seedTopics(fake, ['only']);
		await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'New name' }, NOW);

		expect(fake.read(topicPath('only'))).toMatchObject({ title: 'New name' });
	});
});

describe('choosing a topic', () => {
	it('keeps the chosen count per topic as people choose, change and cancel', async () => {
		const fake = splitRoom();
		seedRegistration(fake, 'u1');
		const firestore = fake.asFirestore();

		await savePreferences(firestore, 'u1', { sessionId: SID, preferences: ['a'] });
		expect(chosen(fake, 'a')).toBe(1);

		await savePreferences(firestore, 'u1', { sessionId: SID, preferences: ['b'] });
		expect([chosen(fake, 'a'), chosen(fake, 'b')]).toEqual([0, 1]);

		await savePreferences(firestore, 'u1', { sessionId: SID, preferences: ['b'], position: 25 });
		expect(chosen(fake, 'b')).toBe(1);

		await cancelRegistration(firestore, 'u1', { sessionId: SID });
		expect(chosen(fake, 'b')).toBe(0);
	});

	it('takes one topic only', async () => {
		const fake = splitRoom();
		seedRegistration(fake, 'u1');
		await expectRefusal(
			savePreferences(fake.asFirestore(), 'u1', { sessionId: SID, preferences: ['a', 'b'] }),
			'invalid-argument',
			'split-by-topic',
		);
	});

	it('counts nothing in a ranked session', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { splitByTopic: true });
		seedTopics(fake, ['a', 'b']);
		seedRegistration(fake, 'u1');
		await savePreferences(fake.asFirestore(), 'u1', { sessionId: SID, preferences: ['a', 'b'] });

		expect(chosen(fake, 'a')).toBeUndefined();
	});

	it('retires choosing a table', async () => {
		const fake = splitRoom();
		seedRegistration(fake, 'u1');
		await expectRefusal(
			joinTable(fake.asFirestore(), 'u1', { sessionId: SID, tableIndex: 0 }),
			'failed-precondition',
			'split-by-topic',
		);
	});
});

describe('closing a splitByTopic session', () => {
	it('closes and publishes in one press, splitting each topic by the rule', async () => {
		const fake = splitRoom(7);
		seedChoosers(fake, 'a', 71);
		seedChoosers(fake, 'b', 8);
		seedRegistration(fake, 'undecided');

		const result = await close(fake);
		const run = publishedRun(fake);

		expect(result).toEqual({
			status: 'published',
			publishedRunId: sessionOf(fake).publishedRunId,
			topicsWithOnePerson: [],
		});
		expect(sessionOf(fake).status).toBe('published');
		expect(run.status).toBe('published');
		const sizes = (topicId: string): number[] =>
			run.tables
				.filter((t) => t.topicId === topicId)
				.map((t) => t.memberUids.length)
				.sort((x, y) => x - y);
		expect(sizes('a')).toEqual([6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7]);
		expect(sizes('b')).toEqual([4, 4]);
		expect(run.tables.map((t) => t.index)).toEqual(run.tables.map((_, i) => i));
		expect(run.tables.slice(0, 11).every((t) => t.topicId === 'a')).toBe(true);
		expect(run.tables.flatMap((t) => t.memberUids)).not.toContain('undecided');
		expect(run.seed).toBeUndefined();
	});

	it('flags a topic one person chose and moves nobody', async () => {
		const fake = splitRoom(7);
		seedChoosers(fake, 'a', 5);
		seedChoosers(fake, 'c', 1);

		const result = await close(fake);

		expect(result.topicsWithOnePerson).toEqual(['c']);
		expect(publishedRun(fake).tables.find((t) => t.topicId === 'c')?.memberUids).toEqual(['c0']);
	});

	it('leaves an older direct session under the choose-a-table rule', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { mode: 'direct' });
		seedTopics(fake, ['a']);
		const result = await close(fake);

		expect(result).toEqual({ status: 'registrationClosed' });
		expect(fake.list('tableAssignmentRuns')).toEqual([]);
	});
});

describe('a latecomer after closing', () => {
	it('is seated at once at the emptiest table of their topic with a free seat', async () => {
		const fake = splitRoom(4);
		seedChoosers(fake, 'a', 7);
		await close(fake);
		seedRegistration(fake, 'late');

		const result = await savePreferences(fake.asFirestore(), 'late', {
			sessionId: SID,
			preferences: ['a'],
		});
		const run = publishedRun(fake);

		const table = run.tables.find((t) => t.memberUids.includes('late'));
		expect(table?.topicId).toBe('a');
		expect(result.tableIndex).toBe(table?.index);
		expect(run.tables.map((t) => t.memberUids.length).sort()).toEqual([4, 4]);
	});

	it('waits for the host when every table of their topic is full', async () => {
		const fake = splitRoom(4);
		seedChoosers(fake, 'a', 8);
		await close(fake);
		seedRegistration(fake, 'late');

		const result = await savePreferences(fake.asFirestore(), 'late', {
			sessionId: SID,
			preferences: ['a'],
		});

		expect(result.tableIndex).toBeUndefined();
		expect(publishedRun(fake).tables.flatMap((t) => t.memberUids)).not.toContain('late');
		expect(chosen(fake, 'a')).toBe(9);
	});
});
