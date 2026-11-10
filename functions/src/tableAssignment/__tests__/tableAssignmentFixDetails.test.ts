import type { TableAssignmentStatus } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { computePreview } from '../fn_tablesComputePreview';
import { fixDetails } from '../fn_tablesFixDetails';
import { publishRun } from '../fn_tablesPublishRun';
import { saveSettings } from '../fn_tablesSaveSettings';
import {
	HOST,
	NOW,
	SID,
	expectRefusal,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

const SESSION = `tableAssignments/${SID}`;

function openWithTopics(status: TableAssignmentStatus = 'registrationOpen'): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, { status });
	seedTopics(fake, ['a', 'b']);

	return fake;
}

const bothTopics = [
	{ topicId: 'a', title: 'Fixed A' },
	{ topicId: 'b', title: 'Fixed B' },
];

describe('tablesFixDetails', () => {
	it('is for the host only', async () => {
		await expectRefusal(
			fixDetails(openWithTopics().asFirestore(), 'other', { sessionId: SID, title: 'X' }),
			'permission-denied',
		);
	});

	it.each<TableAssignmentStatus>(['registrationOpen', 'registrationClosed', 'published'])(
		'renames the gathering and the topics in %s',
		async (status) => {
			const fake = openWithTopics(status);
			await expect(
				fixDetails(
					fake.asFirestore(),
					HOST,
					{ sessionId: SID, title: ' New name ', topics: bothTopics },
					NOW + 1,
				),
			).resolves.toEqual({ title: 'New name', topicIds: ['a', 'b'] });
			expect(fake.read(SESSION)).toMatchObject({ title: 'New name', lastUpdate: NOW + 1 });
			expect(fake.read('tableAssignmentTopics/a')).toMatchObject({ title: 'Fixed A', order: 0 });
			expect(fake.read('tableAssignmentTopics/b')).toMatchObject({ title: 'Fixed B', order: 1 });
		},
	);

	it.each<TableAssignmentStatus>(['draft', 'ended'])('is refused in %s', async (status) => {
		await expectRefusal(
			fixDetails(openWithTopics(status).asFirestore(), HOST, { sessionId: SID, title: 'X' }),
			'failed-precondition',
		);
	});

	it('leaves the topics alone when only the title is sent', async () => {
		const fake = openWithTopics();
		const result = await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'Only' });
		expect(result.topicIds).toEqual(['a', 'b']);
		expect(fake.read('tableAssignmentTopics/a')).toMatchObject({ title: 'Title a' });
	});

	it('keeps the stored title when only topics are sent', async () => {
		const result = await fixDetails(openWithTopics().asFirestore(), HOST, {
			sessionId: SID,
			topics: bothTopics,
		});
		expect(result.title).toBe('Town hall');
	});

	it('keeps every other field of a topic', async () => {
		const fake = openWithTopics();
		fake.seed('tableAssignmentTopics/a', {
			topicId: 'a',
			sessionId: SID,
			title: 'Old',
			description: 'Why',
			maxTables: 3,
			order: 0,
		});
		await fixDetails(fake.asFirestore(), HOST, { sessionId: SID, topics: bothTopics });
		expect(fake.read('tableAssignmentTopics/a')).toMatchObject({
			title: 'Fixed A',
			description: 'Why',
			maxTables: 3,
		});
	});

	it.each([
		[
			'a foreign id',
			[
				{ topicId: 'a', title: 'A' },
				{ topicId: 'zzz', title: 'Z' },
			],
		],
		['an added topic', [...bothTopics, { topicId: 'c', title: 'C' }]],
		['a missing topic', [{ topicId: 'a', title: 'A' }]],
		['a new order', [...bothTopics].reverse()],
		['a repeated topic', [bothTopics[0], bothTopics[0]]],
		['an empty title', [{ topicId: 'a', title: '   ' }, bothTopics[1]]],
	])('refuses %s and changes nothing', async (_name, topics) => {
		const fake = openWithTopics();
		await expectRefusal(
			fixDetails(fake.asFirestore(), HOST, { sessionId: SID, title: 'Nope', topics }),
			'invalid-argument',
		);
		expect(fake.read(SESSION)).toMatchObject({ title: 'Town hall' });
		expect(fake.read('tableAssignmentTopics/a')).toMatchObject({ title: 'Title a' });
	});

	it('keeps a ready preview publishable: titles are not in the hash', async () => {
		const fake = openWithTopics('registrationClosed');
		['u1', 'u2', 'u3', 'u4'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 5 }, NOW);
		const hashBefore = fake.read(`tableAssignmentRunInputs/${runId}`)?.inputHash;
		await fixDetails(fs, HOST, { sessionId: SID, title: 'Renamed', topics: bothTopics });
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).resolves.toEqual({
			publishedRunId: runId,
		});
		expect(fake.read(`tableAssignmentRunInputs/${runId}`)?.inputHash).toBe(hashBefore);
	});
});

describe('tablesSaveSettings: redesign fields', () => {
	it('changes the mode in a draft', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, mode: 'direct' });
		expect(fake.read(SESSION)).toMatchObject({ mode: 'direct' });
	});

	it.each<TableAssignmentStatus>(['registrationOpen', 'registrationClosed', 'published'])(
		'refuses a mode change in %s and saves nothing else',
		async (status) => {
			const fake = new FakeFirestore();
			seedSession(fake, { status });
			await expectRefusal(
				saveSettings(fake.asFirestore(), HOST, { sessionId: SID, mode: 'direct', title: 'X' }),
				'failed-precondition',
			);
			expect(fake.read(SESSION)).toMatchObject({ mode: 'ranked', title: 'Town hall' });
		},
	);

	it('refuses an unknown mode', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		await expectRefusal(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, mode: 'weird' as 'direct' }),
			'invalid-argument',
		);
	});

	it('leaves the mode alone when it is not sent', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'registrationOpen' });
		await saveSettings(fake.asFirestore(), HOST, { sessionId: SID, title: 'Renamed' });
		expect(fake.read(SESSION)).toMatchObject({ mode: 'ranked', title: 'Renamed' });
	});

	it('saves expected people and return by name, and keeps them across other saves', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		const fs = fake.asFirestore();
		await saveSettings(fs, HOST, {
			sessionId: SID,
			expectedParticipants: 42,
			allowReturnByName: true,
		});
		await saveSettings(fs, HOST, { sessionId: SID, tableSize: 6 });
		expect(fake.read(SESSION)).toMatchObject({
			settings: { tableSize: 6, expectedParticipants: 42, allowReturnByName: true },
		});
	});

	it('clears expected people with null and switches return by name off', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' }, { expectedParticipants: 42, allowReturnByName: true });
		await saveSettings(fake.asFirestore(), HOST, {
			sessionId: SID,
			expectedParticipants: null,
			allowReturnByName: false,
		});
		const { settings } = fake.read(SESSION) as { settings: Record<string, unknown> };
		expect(settings).not.toHaveProperty('expectedParticipants');
		expect(settings.allowReturnByName).toBe(false);
	});

	it('refuses fewer than one expected person', async () => {
		const fake = new FakeFirestore();
		seedSession(fake, { status: 'draft' });
		await expectRefusal(
			saveSettings(fake.asFirestore(), HOST, { sessionId: SID, expectedParticipants: 0 }),
			'invalid-argument',
		);
	});

	it('does not stale a preview when only expected people or return by name change', async () => {
		const fake = openWithTopics('registrationClosed');
		['u1', 'u2', 'u3', 'u4'].forEach((uid) => seedRegistration(fake, uid, { preferences: ['a'] }));
		const fs = fake.asFirestore();
		const { runId } = await computePreview(fs, HOST, { sessionId: SID, seed: 5 }, NOW);
		await saveSettings(fs, HOST, {
			sessionId: SID,
			expectedParticipants: 10,
			allowReturnByName: true,
		});
		await expect(publishRun(fs, HOST, { sessionId: SID, runId })).resolves.toEqual({
			publishedRunId: runId,
		});
	});
});
