import { describe, expect, it } from 'vitest';
import type { ClassTable, Statement, StatementSubscription } from '@freedi/shared-types';
import {
	campMark,
	challengeOf,
	rosterCount,
	sideWordKey,
	tableChips,
	tableNumberOf,
	videoUrlOf,
	youtubeEmbedUrl,
} from '../c2Helpers';

const sub = (role: string): StatementSubscription => ({ role }) as unknown as StatementSubscription;
const stmt = (settings: Record<string, unknown>): Statement =>
	({ statementSettings: settings }) as unknown as Statement;

describe('sideWordKey', () => {
	it('maps the three zones', () => {
		expect(sideWordKey(0)).toBe('side.near_a');
		expect(sideWordKey(39)).toBe('side.near_a');
		expect(sideWordKey(40)).toBe('side.middle');
		expect(sideWordKey(50)).toBe('side.middle');
		expect(sideWordKey(60)).toBe('side.middle');
		expect(sideWordKey(61)).toBe('side.near_b');
		expect(sideWordKey(100)).toBe('side.near_b');
	});
});

describe('campMark', () => {
	it('gives each camp its own shape', () => {
		const marks = new Set([campMark('a'), campMark('center'), campMark('b'), campMark(undefined)]);
		expect(marks.size).toBe(4);
	});
});

describe('rosterCount', () => {
	it('does not count the teacher', () => {
		expect(rosterCount([sub('admin'), sub('member'), sub('member')])).toBe(2);
		expect(rosterCount([])).toBe(0);
	});
});

describe('challengeOf', () => {
	it('finds the challenge question', () => {
		const ch = stmt({ classRole: 'challenge' });
		expect(challengeOf([stmt({}), ch])).toBe(ch);
		expect(challengeOf([stmt({})])).toBeNull();
	});
});

describe('videoUrlOf / youtubeEmbedUrl', () => {
	it('accepts only https urls', () => {
		expect(videoUrlOf(stmt({ videoUrl: 'https://x.test/a.mp4' }))).toBe('https://x.test/a.mp4');
		expect(videoUrlOf(stmt({ videoUrl: 'javascript:alert(1)' }))).toBeNull();
		expect(videoUrlOf(stmt({}))).toBeNull();
	});
	it('builds a youtube embed', () => {
		expect(youtubeEmbedUrl('https://youtu.be/abcDEF12345')).toContain('/embed/abcDEF12345');
		expect(youtubeEmbedUrl('https://x.test/a.mp4')).toBeNull();
	});
});

describe('tableNumberOf', () => {
	it('parses the number', () => {
		expect(tableNumberOf('main1--3')).toBe(3);
		expect(tableNumberOf('a--b--12')).toBe(12);
		expect(tableNumberOf('nope')).toBeNull();
		expect(tableNumberOf(undefined)).toBeNull();
	});
});

describe('tableChips', () => {
	const table = {
		memberUids: ['u1', 'u2'],
		noDeviceMembers: [{ id: 'nd1', name: 'Rina' }],
	} as unknown as ClassTable;
	const roster = [
		{ userId: 'u1', camp: 'a', user: { displayName: 'Dana' } },
		{ userId: 'u2', camp: 'b', user: { displayName: 'Omer' } },
	] as unknown as StatementSubscription[];
	const options = { myUid: 'u2', labelOf: (n: string) => n, fallbackName: '?' };

	it('puts me first, then tablemates, then no-device members', () => {
		const chips = tableChips(table, roster, options);
		expect(chips.map((c) => c.name)).toEqual(['Omer', 'Dana', 'Rina']);
		expect(chips[0].isMe).toBe(true);
		expect(chips[0].mark).toBe(campMark('b'));
		expect(chips[2].mark).toBe(campMark(undefined));
	});
	it('falls back to a placeholder name and handles no table', () => {
		expect(tableChips(table, [], options)[0].name).toBe('?');
		expect(tableChips(null, roster, options)).toEqual([]);
	});
});
