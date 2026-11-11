import { describe, expect, it } from 'vitest';
import { makeRosterEntry, makeRun } from '../../__tests__/fixtures';
import { publishedRunOf, unseatedSincePublished } from '../latecomers';

describe('unseatedSincePublished', () => {
	const published = makeRun({ status: 'published' });

	it('is empty before anything is published', () => {
		expect(unseatedSincePublished(undefined, [makeRosterEntry('u1')])).toEqual([]);
	});

	it('lists only the registered people the published run does not seat', () => {
		const roster = ['u1', 'u2', 'u3', 'u4', 'u5'].map((uid) => makeRosterEntry(uid));
		const late = unseatedSincePublished(published, roster);

		// The fixture run seats u1, u2 and u3.
		expect(late.map((person) => person.uid)).toEqual(['u4', 'u5']);
	});

	it('counts nobody when everyone is seated', () => {
		const roster = ['u1', 'u2'].map((uid) => makeRosterEntry(uid));

		expect(unseatedSincePublished(published, roster)).toEqual([]);
	});
});

describe('publishedRunOf', () => {
	it('picks the run the session points at, and only when it is published', () => {
		const older = makeRun({ runId: 'a', status: 'published' });
		const newer = makeRun({ runId: 'b', status: 'ready' });

		expect(publishedRunOf([older, newer], 'a')?.runId).toBe('a');
		expect(publishedRunOf([older, newer], 'b')).toBeUndefined();
		expect(publishedRunOf([older, newer], undefined)).toBeUndefined();
	});
});
