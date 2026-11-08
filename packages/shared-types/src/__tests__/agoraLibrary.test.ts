import {
	AGORA_LIBRARY,
	AGORA_LIBRARY_SEED_TAGS,
	AgoraLibraryTag,
	agoraTagId,
	applyRatingChange,
	bayesianAverage,
	editDistance,
	emptyLibraryStats,
	findNearDuplicateTags,
	isNewScenario,
	isNewerVersionAvailable,
	isValidStars,
	normalizeTagKey,
	publishProblems,
	seedTagDocs,
	showsAsFilterChip,
	tagLabelIn,
} from '../models/agora';

const MEAN = 3.8;

function tag(kind: 'subject' | 'lessonType', label: string): AgoraLibraryTag {
	const key = normalizeTagKey(label);

	return {
		tagId: agoraTagId(kind, key),
		kind,
		label,
		labelLang: 'he',
		labels: { he: label },
		normalizedKey: key,
		status: 'approved',
		scenarioCount: 1,
		teacherIds: [],
		createdBy: 'seed',
		createdAt: 0,
		lastUpdate: 0,
	};
}

describe('bayesianAverage', () => {
	it('is the global mean with no ratings', () => {
		expect(bayesianAverage(0, 0, MEAN)).toBe(MEAN);
	});

	it('does not let one 5-star beat 4.7 over forty', () => {
		const single = bayesianAverage(5, 1, MEAN);
		const proven = bayesianAverage(4.7 * 40, 40, MEAN);
		expect(single).toBeLessThan(proven);
	});

	it('approaches the plain mean as ratings accumulate', () => {
		expect(bayesianAverage(5 * 1000, 1000, MEAN)).toBeGreaterThan(4.98);
	});
});

describe('applyRatingChange', () => {
	const empty = emptyLibraryStats(MEAN);

	it('counts a first rating and its review', () => {
		const next = applyRatingChange(empty, null, { stars: 5, hasText: true }, MEAN);
		expect(next).toMatchObject({ ratingCount: 1, ratingSum: 5, reviewCount: 1 });
		expect(next.ratingBayes).toBeCloseTo(bayesianAverage(5, 1, MEAN));
	});

	it('replaces an edited rating instead of adding a second', () => {
		const first = applyRatingChange(empty, null, { stars: 5, hasText: true }, MEAN);
		const edited = applyRatingChange(
			first,
			{ stars: 5, hasText: true },
			{ stars: 2, hasText: false },
			MEAN,
		);
		expect(edited).toMatchObject({ ratingCount: 1, ratingSum: 2, reviewCount: 0 });
	});

	it('removes a hidden rating and never goes negative', () => {
		const first = applyRatingChange(empty, null, { stars: 4, hasText: false }, MEAN);
		const removed = applyRatingChange(first, { stars: 4, hasText: false }, null, MEAN);
		expect(removed).toMatchObject({ ratingCount: 0, ratingSum: 0 });
		expect(removed.ratingBayes).toBe(MEAN);
		const again = applyRatingChange(removed, { stars: 4, hasText: false }, null, MEAN);
		expect(again.ratingCount).toBe(0);
	});

	it('keeps the copy count', () => {
		const withCopies = { ...empty, copyCount: 7 };
		expect(applyRatingChange(withCopies, null, { stars: 3, hasText: false }, MEAN).copyCount).toBe(
			7,
		);
	});
});

describe('isValidStars', () => {
	it('accepts whole numbers 1 to 5 only', () => {
		expect([1, 3, 5].every(isValidStars)).toBe(true);
		expect([0, 6, 2.5, NaN, '4', null].some(isValidStars)).toBe(false);
	});
});

describe('normalizeTagKey', () => {
	it('strips niqqud, quotes, punctuation and extra spaces', () => {
		expect(normalizeTagKey('  רוֹב  מול   מיעוט ')).toBe('רוב מול מיעוט');
		expect(normalizeTagKey('בריונות (אלימות בכיתה)')).toBe('בריונות אלימות בכיתה');
		expect(normalizeTagKey('״חברה״')).toBe('חברה');
	});

	it('drops a leading definite article from a long enough word', () => {
		expect(normalizeTagKey('הדמוקרטיה')).toBe(normalizeTagKey('דמוקרטיה'));
		expect(normalizeTagKey('הוא')).toBe('הוא');
	});

	it('lower-cases Latin', () => {
		expect(normalizeTagKey('Civics')).toBe('civics');
	});
});

describe('agoraTagId', () => {
	it('is stable, and separates kinds', () => {
		expect(agoraTagId('subject', 'חברה')).toBe(agoraTagId('subject', 'חברה'));
		expect(agoraTagId('subject', 'חברה')).not.toBe(agoraTagId('lessonType', 'חברה'));
	});

	it('gives the six seed tags six different ids', () => {
		const ids = seedTagDocs(1).map((doc) => doc.tagId);
		expect(new Set(ids).size).toBe(AGORA_LIBRARY_SEED_TAGS.length);
	});
});

describe('editDistance', () => {
	it('measures and bails out past the limit', () => {
		expect(editDistance('חברה', 'חברה')).toBe(0);
		expect(editDistance('עישון', 'עישונ')).toBe(1);
		expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
	});
});

describe('findNearDuplicateTags', () => {
	const tags = [
		tag('subject', 'עישון'),
		tag('subject', 'בריונות (אלימות בכיתה)'),
		tag('subject', 'רוב מול מיעוט בדמוקרטיה'),
		tag('lessonType', 'חברה'),
	];

	it('finds the same tag however it is spelled', () => {
		const found = findNearDuplicateTags('עִישׁוּן', 'subject', tags);
		expect(found[0]?.reason).toBe('same');
	});

	it('finds a prefix, a containing tag and a close misspelling', () => {
		expect(findNearDuplicateTags('בריונ', 'subject', tags)[0]?.reason).toBe('prefix');
		expect(findNearDuplicateTags('אלימות', 'subject', tags)[0]?.reason).toBe('contains');
		expect(findNearDuplicateTags('עישונן', 'subject', tags)[0]).toBeDefined();
	});

	it('stays inside its kind and skips merged-away tags', () => {
		expect(findNearDuplicateTags('חברה', 'subject', tags)).toEqual([]);
		const merged = [{ ...tags[0], aliasOf: 'x' }];
		expect(findNearDuplicateTags('עישון', 'subject', merged)).toEqual([]);
	});

	it('offers nothing for an unrelated word', () => {
		expect(findNearDuplicateTags('גיאוגרפיה', 'subject', tags)).toEqual([]);
	});
});

describe('showsAsFilterChip', () => {
	const base = { status: 'pending' as const, scenarioCount: 1, teacherIds: ['a'] };

	it('hides a pending tag until two scenarios by two teachers use it', () => {
		expect(showsAsFilterChip(base)).toBe(false);
		expect(showsAsFilterChip({ ...base, scenarioCount: 2 })).toBe(false);
		expect(showsAsFilterChip({ ...base, scenarioCount: 2, teacherIds: ['a', 'b'] })).toBe(true);
	});

	it('shows approved tags that are used, never merged ones', () => {
		expect(showsAsFilterChip({ ...base, status: 'approved' })).toBe(true);
		expect(showsAsFilterChip({ ...base, status: 'approved', scenarioCount: 0 })).toBe(false);
		expect(showsAsFilterChip({ ...base, status: 'approved', aliasOf: 'z' })).toBe(false);
	});
});

describe('tagLabelIn', () => {
	it('falls back to the author words', () => {
		expect(tagLabelIn({ label: 'חברה', labels: { he: 'חברה', en: 'Society' } }, 'en')).toBe(
			'Society',
		);
		expect(tagLabelIn({ label: 'חברה', labels: { he: 'חברה' } }, 'nl')).toBe('חברה');
	});
});

describe('seed vocabulary', () => {
	it('carries every language for every seed tag', () => {
		for (const seed of AGORA_LIBRARY_SEED_TAGS) {
			expect(Object.keys(seed.labels).sort()).toEqual(['ar', 'de', 'en', 'es', 'he', 'nl']);
		}
	});

	it('is the three subjects and three lesson types the owner chose', () => {
		const subjects = AGORA_LIBRARY_SEED_TAGS.filter((seed) => seed.kind === 'subject');
		expect(subjects.map((seed) => seed.labels.he)).toEqual([
			'בריונות (אלימות בכיתה)',
			'עישון',
			'רוב מול מיעוט בדמוקרטיה',
		]);
		expect(
			AGORA_LIBRARY_SEED_TAGS.filter((seed) => seed.kind === 'lessonType').map(
				(seed) => seed.labels.he,
			),
		).toEqual(['חברה', 'אזרחות', 'היסטוריה']);
	});
});

describe('isNewerVersionAvailable', () => {
	it('is true only when the original moved after the copy was taken', () => {
		expect(isNewerVersionAvailable({ sourceVersion: 100 }, { lastUpdate: 200 })).toBe(true);
		expect(isNewerVersionAvailable({ sourceVersion: 200 }, { lastUpdate: 200 })).toBe(false);
		expect(isNewerVersionAvailable({ sourceVersion: 300 }, { lastUpdate: 200 })).toBe(false);
	});

	it('is false for a scenario that is not a copy, or whose original is gone', () => {
		expect(isNewerVersionAvailable({}, { lastUpdate: 200 })).toBe(false);
		expect(isNewerVersionAvailable({ sourceVersion: 1 }, null)).toBe(false);
	});
});

describe('isNewScenario', () => {
	it('badges the last two weeks', () => {
		const day = 24 * 60 * 60 * 1000;
		expect(isNewScenario(Date.now() - 3 * day, Date.now())).toBe(true);
		expect(isNewScenario(Date.now() - 30 * day, Date.now())).toBe(false);
	});
});

describe('publishProblems', () => {
	const ok = {
		summary: 'כיתה שלמה מנסה להבין איך מגינים על מיעוט בלי לפגוע ברוב.',
		subjectIds: ['s1'],
		lessonTypeIds: ['l1'],
		ready: true,
		language: 'he',
	};

	it('passes a complete scenario', () => {
		expect(publishProblems(ok)).toEqual([]);
	});

	it('names every missing piece', () => {
		expect(
			publishProblems({
				...ok,
				summary: 'קצר',
				subjectIds: [],
				lessonTypeIds: [],
				ready: false,
				language: '',
			}),
		).toEqual([
			'not_ready',
			'no_language',
			'summary_short',
			'subjects_missing',
			'lesson_types_missing',
		]);
	});

	it('caps tags and summary length', () => {
		expect(
			publishProblems({
				...ok,
				summary: 'א'.repeat(AGORA_LIBRARY.SUMMARY_MAX + 1),
				subjectIds: ['1', '2', '3', '4', '5'],
				lessonTypeIds: ['1', '2', '3'],
			}),
		).toEqual(['summary_long', 'subjects_many', 'lesson_types_many']);
	});
});
