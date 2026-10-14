import { describe, expect, it } from 'vitest';
import type {
	AgoraLibraryTag,
	AgoraScenarioCardText,
	AgoraTopicPackage,
} from '@freedi/shared-types';
import {
	applyFilters,
	cardTextFor,
	chipTags,
	featuredScenarios,
	hasActiveFilters,
	NO_FILTERS,
	ratingLabel,
	searchScore,
	untranslatedIds,
} from '../view';

function tag(
	id: string,
	kind: 'subject' | 'lessonType',
	labels: Record<string, string>,
	extra: Partial<AgoraLibraryTag> = {},
): AgoraLibraryTag {
	return {
		tagId: id,
		kind,
		label: labels.he ?? Object.values(labels)[0],
		labelLang: 'he',
		labels,
		normalizedKey: id,
		status: 'approved',
		scenarioCount: 1,
		teacherIds: [],
		createdBy: 'seed',
		createdAt: 0,
		lastUpdate: 0,
		...extra,
	};
}

function scenario(
	id: string,
	overrides: Partial<AgoraTopicPackage> & {
		subjectIds?: string[];
		lessonTypeIds?: string[];
		summary?: string;
	} = {},
): AgoraTopicPackage {
	const {
		subjectIds = ['s-smoke'],
		lessonTypeIds = ['l-civics'],
		summary = '',
		...rest
	} = overrides;

	return {
		topicPackageId: id,
		creatorId: 'author',
		language: 'he',
		title: `כותרת ${id}`,
		visibility: 'public',
		library: {
			summary: summary || `תקציר של ${id} שמספיק ארוך`,
			subjectIds,
			lessonTypeIds,
			publishedAt: 1,
			authorId: 'author',
			authorName: 'דנה',
			hidden: false,
		},
		stats: { ratingCount: 0, ratingSum: 0, ratingBayes: 3.8, reviewCount: 0, copyCount: 0 },
		lastUpdate: 1,
		...rest,
	} as AgoraTopicPackage;
}

const tags = new Map<string, AgoraLibraryTag>([
	['s-smoke', tag('s-smoke', 'subject', { he: 'עישון', en: 'Smoking' })],
	['s-bully', tag('s-bully', 'subject', { he: 'בריונות', en: 'Bullying' })],
	['l-civics', tag('l-civics', 'lessonType', { he: 'אזרחות', en: 'Civics' })],
	['l-history', tag('l-history', 'lessonType', { he: 'היסטוריה', en: 'History' })],
]);
const none = new Map<string, AgoraScenarioCardText>();

describe('cardTextFor', () => {
	it("shows the author's words in the author's language", () => {
		const pkg = scenario('a');
		expect(cardTextFor(pkg, 'he', none)).toEqual({
			title: 'כותרת a',
			summary: pkg.library?.summary,
			translated: false,
		});
	});

	it('shows the cached translation for a reader in another language', () => {
		const translations = new Map([
			[
				'a',
				{
					title: 'Title a',
					summary: 'Summary a',
					challengeQuestion: '',
					characters: [],
					scenes: [],
				},
			],
		]);
		expect(cardTextFor(scenario('a'), 'en', translations)).toEqual({
			title: 'Title a',
			summary: 'Summary a',
			translated: true,
		});
	});

	it('falls back to the original until the translation lands', () => {
		expect(cardTextFor(scenario('a'), 'en', none).translated).toBe(false);
	});
});

describe('untranslatedIds', () => {
	it('lists only foreign-language scenarios with no translation yet', () => {
		const list = [scenario('a'), scenario('b', { language: 'en' }), scenario('c')];
		const have = new Map([
			['c', { title: 'c', summary: '', challengeQuestion: '', characters: [], scenes: [] }],
		]);
		expect(untranslatedIds(list, 'en', have)).toEqual(['a']);
	});
});

describe('applyFilters', () => {
	const list = [
		scenario('a', { subjectIds: ['s-smoke'], lessonTypeIds: ['l-civics'] }),
		scenario('b', { title: 'הכיתה השקטה', subjectIds: ['s-bully'], lessonTypeIds: ['l-civics'] }),
		scenario('c', { subjectIds: ['s-bully', 's-smoke'], lessonTypeIds: ['l-history'] }),
		scenario('d', { language: 'en', subjectIds: ['s-smoke'], lessonTypeIds: ['l-history'] }),
	];
	const run = (filters: Partial<typeof NO_FILTERS>, lang = 'he'): string[] =>
		applyFilters(list, { ...NO_FILTERS, ...filters }, lang, tags, none).map(
			(pkg) => pkg.topicPackageId,
		);

	it('leaves the loaded order alone with no filter', () => {
		expect(run({})).toEqual(['a', 'b', 'c', 'd']);
	});

	it('is OR inside a group', () => {
		expect(run({ subjectIds: ['s-bully'] })).toEqual(['b', 'c']);
		expect(run({ subjectIds: ['s-bully', 's-smoke'] })).toEqual(['a', 'b', 'c', 'd']);
	});

	it('is AND across groups: history AND smoking', () => {
		expect(run({ subjectIds: ['s-smoke'], lessonTypeIds: ['l-history'] })).toEqual(['c', 'd']);
	});

	it('filters by the language the scenario is written in', () => {
		expect(run({ language: 'en' })).toEqual(['d']);
	});

	it('searches titles, summaries and tag labels in any language', () => {
		expect(run({ query: 'השקטה' })).toEqual(['b']);
		expect(run({ query: 'Smoking' })).toEqual(['a', 'c', 'd']);
		expect(run({ query: 'בריונות היסטוריה' })).toEqual(['c']);
		expect(run({ query: 'nothing like this' })).toEqual([]);
	});

	it('puts a title hit before a summary hit', () => {
		const withSummary = [
			scenario('x', { title: 'משהו אחר', summary: 'כאן מדברים על דמוקרטיה בכיתה' }),
			scenario('y', { title: 'דמוקרטיה בפעולה' }),
		];
		const ranked = applyFilters(
			withSummary,
			{ ...NO_FILTERS, query: 'דמוקרטיה' },
			'he',
			tags,
			none,
		).map((pkg) => pkg.topicPackageId);
		expect(ranked).toEqual(['y', 'x']);
	});

	it('finds a scenario by its translated title', () => {
		const translations = new Map([
			[
				'd',
				{
					title: 'Quiet Classroom',
					summary: '',
					challengeQuestion: '',
					characters: [],
					scenes: [],
				},
			],
		]);
		const found = applyFilters(
			list,
			{ ...NO_FILTERS, query: 'quiet' },
			'he',
			tags,
			translations,
		).map((pkg) => pkg.topicPackageId);
		expect(found).toEqual(['d']);
	});
});

describe('searchScore', () => {
	it('is zero unless every word is found', () => {
		expect(searchScore(scenario('a'), 'כותרת zzz', 'he', tags, none)).toBe(0);
		expect(searchScore(scenario('a'), '', 'he', tags, none)).toBe(1);
	});
});

describe('hasActiveFilters', () => {
	it('is false only for the empty state', () => {
		expect(hasActiveFilters(NO_FILTERS)).toBe(false);
		expect(hasActiveFilters({ ...NO_FILTERS, query: ' x ' })).toBe(true);
		expect(hasActiveFilters({ ...NO_FILTERS, language: 'en' })).toBe(true);
		expect(hasActiveFilters({ ...NO_FILTERS, subjectIds: ['s'] })).toBe(true);
	});
});

describe('featuredScenarios', () => {
	const rated = (id: string, count: number, bayes: number): AgoraTopicPackage =>
		scenario(id, {
			stats: {
				ratingCount: count,
				ratingSum: count * 4,
				ratingBayes: bayes,
				reviewCount: 0,
				copyCount: 0,
			},
		});

	it('takes only scenarios with three or more ratings, best first', () => {
		const featured = featuredScenarios([
			rated('few', 2, 4.9),
			rated('ok', 3, 4.1),
			rated('best', 20, 4.7),
		]);
		expect(featured.map((pkg) => pkg.topicPackageId)).toEqual(['best', 'ok']);
	});

	it('is empty in a young library', () => {
		expect(featuredScenarios([scenario('a'), scenario('b')])).toEqual([]);
	});
});

describe('chipTags', () => {
	it('gives chips to approved used tags and to pending ones the crowd adopted, most used first', () => {
		const all = [
			tag('a', 'subject', { he: 'א' }, { scenarioCount: 2 }),
			tag('b', 'subject', { he: 'ב' }, { scenarioCount: 5 }),
			tag('c', 'subject', { he: 'ג' }, { status: 'pending', scenarioCount: 1, teacherIds: ['x'] }),
			tag(
				'd',
				'subject',
				{ he: 'ד' },
				{ status: 'pending', scenarioCount: 3, teacherIds: ['x', 'y'] },
			),
			tag('e', 'lessonType', { he: 'ה' }),
		];
		expect(chipTags(all, 'subject', 'he', []).map((entry) => entry.tagId)).toEqual(['b', 'd', 'a']);
		// a selected pending tag keeps its chip so it can be turned off
		expect(chipTags(all, 'subject', 'he', ['c']).map((entry) => entry.tagId)).toContain('c');
	});
});

describe('ratingLabel', () => {
	it('is the mean to one decimal, or nothing', () => {
		expect(
			ratingLabel({
				stats: { ratingCount: 3, ratingSum: 14, ratingBayes: 4, reviewCount: 0, copyCount: 0 },
			}),
		).toBe('4.7');
		expect(ratingLabel({ stats: undefined })).toBe('');
	});
});
