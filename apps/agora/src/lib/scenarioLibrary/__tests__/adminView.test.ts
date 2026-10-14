import { describe, expect, it } from 'vitest';
import type { AgoraLibraryReport, AgoraLibraryTag } from '@freedi/shared-types';
import { groupReports, liveTagsOf, mergeCandidates } from '../adminView';

function report(
	id: string,
	targetId: string,
	extra: Partial<AgoraLibraryReport> = {},
): AgoraLibraryReport {
	return {
		reportId: id,
		targetKind: 'post',
		targetId,
		scenarioId: 's1',
		reporterId: `u-${id}`,
		reporterName: id,
		reason: '',
		status: 'open',
		createdAt: 1,
		...extra,
	};
}

function tag(id: string, label: string, extra: Partial<AgoraLibraryTag> = {}): AgoraLibraryTag {
	return {
		tagId: id,
		kind: 'subject',
		label,
		labelLang: 'he',
		labels: { he: label },
		normalizedKey: label,
		status: 'approved',
		scenarioCount: 0,
		teacherIds: [],
		createdBy: 'seed',
		createdAt: 1,
		lastUpdate: 1,
		...extra,
	};
}

describe('groupReports', () => {
	it('groups by target, most reported first, then newest', () => {
		const groups = groupReports([
			report('a', 'p1', { createdAt: 5 }),
			report('b', 'p2', { createdAt: 9 }),
			report('c', 'p1', { createdAt: 6, reason: 'spam' }),
			report('d', 'p3', { createdAt: 7, targetKind: 'review' }),
		]);
		expect(groups.map((group) => `${group.targetKind}:${group.targetId}`)).toEqual([
			'post:p1',
			'post:p2',
			'review:p3',
		]);
		expect(groups[0].reports).toHaveLength(2);
		expect(groups[0].reasons).toEqual(['spam']);
		expect(groups[0].reporters).toEqual(['c', 'a']);
	});

	it('keeps a post and a review with the same id apart, and ignores resolved reports', () => {
		const groups = groupReports([
			report('a', 'x', { targetKind: 'post' }),
			report('b', 'x', { targetKind: 'review' }),
			report('c', 'x', { status: 'resolved' }),
		]);
		expect(groups).toHaveLength(2);
		expect(groups.every((group) => group.reports.length === 1)).toBe(true);
	});

	it('de-duplicates reasons and reporters', () => {
		const [group] = groupReports([
			report('a', 'p', { reason: ' spam ', reporterName: 'Dana' }),
			report('b', 'p', { reason: 'spam', reporterName: 'Dana' }),
		]);
		expect(group.reasons).toEqual(['spam']);
		expect(group.reporters).toEqual(['Dana']);
	});
});

describe('mergeCandidates', () => {
	it('offers the less used tag as the duplicate of the more used one', () => {
		const candidates = mergeCandidates(
			[
				tag('a', 'עישון', { scenarioCount: 5 }),
				tag('b', 'עישונ', { scenarioCount: 1 }),
				tag('c', 'חלל', { scenarioCount: 2 }),
			],
			8,
		);
		expect(candidates).toHaveLength(1);
		expect(candidates[0].into.tagId).toBe('a');
		expect(candidates[0].from.tagId).toBe('b');
	});

	it('never pairs a tag with itself, tags of two kinds, or an alias, and lists a pair once', () => {
		const candidates = mergeCandidates(
			[
				tag('a', 'בריונות'),
				tag('b', 'בריונות בכיתה'),
				tag('c', 'בריונות', { kind: 'lessonType' }),
				tag('d', 'בריונות בבית', { aliasOf: 'a' }),
			],
			8,
		);
		expect(candidates).toHaveLength(1);
	});

	it('is capped', () => {
		const many = Array.from({ length: 6 }, (_, index) => tag(`t${index}`, `היסטוריה ${index}`));
		expect(mergeCandidates(many, 3)).toHaveLength(3);
	});
});

describe('liveTagsOf', () => {
	it('keeps one kind, drops aliases and sorts by the viewer label', () => {
		const list = liveTagsOf(
			[
				tag('b', 'ב'),
				tag('a', 'א'),
				tag('x', 'ג', { aliasOf: 'a' }),
				tag('l', 'ד', { kind: 'lessonType' }),
			],
			'subject',
			'he',
		);
		expect(list.map((entry) => entry.tagId)).toEqual(['a', 'b']);
	});
});
