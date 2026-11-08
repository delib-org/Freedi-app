import { describe, it, expect, jest } from '@jest/globals';
import { AgoraSceneKind, AgoraTopicPackage, AgoraTopicStatus } from '@freedi/shared-types';

// libraryAccess and libraryStats import ../db (getFirestore on an uninitialised
// app); everything tested here is pure.
jest.mock('../../db', () => ({ db: {} }));

import {
	applyPackageStrings,
	cardStringsOf,
	cardTextFrom,
	collectPackageStrings,
	firstNameOf,
	libraryGlobalMean,
} from '../libraryStrings';
import { isScenarioCoverUrl, tagDelta } from '../libraryPublish';
import { chunkStrings } from '../libraryTranslate';
import { countCopy, countTag, dayKey, WEEK_MS } from '../libraryAccess';
import { globalMeanOf, readTotals } from '../libraryStats';

function scenario(): AgoraTopicPackage {
	return {
		topicPackageId: 'sc-1',
		creatorId: 'author',
		topic: 'מהפכה',
		language: 'he',
		status: AgoraTopicStatus.ready,
		title: 'המהפכה',
		framingText: 'חוזרים בזמן',
		characters: [
			{
				characterId: 'a',
				name: 'רוזן',
				role: 'אציל',
				arguments: ['טיעון א', 'טיעון ב'],
				needs: ['צורך'],
				values: [{ valueId: 'v1', label: 'סדר', description: 'חשש מכאוס' }],
			},
			{
				characterId: 'b',
				name: 'עורך דין',
				role: 'יעקוביני',
				arguments: ['טיעון ג'],
				values: [{ valueId: 'v2', label: 'חופש', description: 'חירות לכל' }],
			},
		],
		positioningScale: {
			leftLabel: 'שמרנות',
			rightLabel: 'מהפכנות',
			leftCharacterId: 'a',
			rightCharacterId: 'b',
		},
		challengeQuestion: 'מה עושים?',
		valueAnswerKey: [
			{
				characterId: 'a',
				expectedValues: [{ valueId: 'v1', label: 'סדר', description: 'חשש מכאוס' }],
			},
		],
		plausibilityRubric: {
			criteria: [{ criterionId: 'c1', label: 'סבירות', description: 'האם זה אפשרי', weight: 1 }],
		},
		healthMetrics: [
			{
				metricId: 'm1',
				label: 'לחם',
				description: 'מחיר הלחם',
				min: 0,
				max: 10,
				baseline: 5,
			},
		],
		scenes: [
			{
				sceneId: 's1',
				kind: AgoraSceneKind.intro,
				title: 'פתיחה',
				text: 'ימים סוערים',
				imageUrls: ['https://example.com/a.png'],
				dialogue: [{ speaker: 'רוזן', line: 'שלום' }],
			},
		],
		createdAt: 1,
		lastUpdate: 2,
	} as AgoraTopicPackage;
}

describe('collect / apply package strings', () => {
	it('collects every word the students read, in a stable order', () => {
		const strings = collectPackageStrings(scenario());
		expect(strings.slice(0, 4)).toEqual(['המהפכה', 'מהפכה', 'חוזרים בזמן', 'מה עושים?']);
		expect(strings).toContain('טיעון ב');
		expect(strings).toContain('צורך');
		expect(strings).toContain('ימים סוערים');
		expect(strings).toContain('שלום');
	});

	it('writes translations back into the same slots and nothing else', () => {
		const original = scenario();
		const strings = collectPackageStrings(original).map((text) => `EN:${text}`);
		const translated = applyPackageStrings(original, strings);

		expect(translated.title).toBe('EN:המהפכה');
		expect(translated.characters[0].arguments).toEqual(['EN:טיעון א', 'EN:טיעון ב']);
		expect(translated.scenes[0].dialogue[0].line).toBe('EN:שלום');
		// ids, kinds, numbers and URLs are untouched
		expect(translated.characters[0].characterId).toBe('a');
		expect(translated.scenes[0].kind).toBe(AgoraSceneKind.intro);
		expect(translated.scenes[0].imageUrls).toEqual(['https://example.com/a.png']);
		expect(translated.healthMetrics[0].max).toBe(10);
		expect(translated.plausibilityRubric.criteria[0].weight).toBe(1);
	});

	it('does not mutate its input', () => {
		const original = scenario();
		applyPackageStrings(
			original,
			collectPackageStrings(original).map((text) => `X${text}`),
		);
		expect(original.title).toBe('המהפכה');
	});

	it('keeps the grading key in step with the translated character values', () => {
		const original = scenario();
		const translated = applyPackageStrings(
			original,
			collectPackageStrings(original).map((text) => (text === 'סדר' ? 'Order' : text)),
		);
		expect(translated.characters[0].values[0].label).toBe('Order');
		expect(translated.valueAnswerKey[0].expectedValues[0].label).toBe('Order');
	});

	it('refuses an answer of the wrong length', () => {
		expect(() => applyPackageStrings(scenario(), ['only one'])).toThrow();
	});
});

describe('card strings', () => {
	it('round-trips through the card text', () => {
		const pkg = scenario();
		const strings = cardStringsOf(pkg, 'תקציר');
		expect(strings).toEqual([
			'המהפכה',
			'תקציר',
			'מה עושים?',
			'רוזן — אציל',
			'עורך דין — יעקוביני',
			'פתיחה',
		]);
		expect(cardTextFrom(pkg, strings)).toEqual({
			title: 'המהפכה',
			summary: 'תקציר',
			challengeQuestion: 'מה עושים?',
			characters: ['רוזן — אציל', 'עורך דין — יעקוביני'],
			scenes: ['פתיחה'],
		});
	});
});

describe('firstNameOf', () => {
	it('gives a first name, and never an e-mail', () => {
		expect(firstNameOf('Dana Cohen')).toBe('Dana');
		expect(firstNameOf('  דנה   כהן ')).toBe('דנה');
		expect(firstNameOf('dana@school.org')).toBe('');
		expect(firstNameOf(undefined)).toBe('');
	});
});

describe('library mean', () => {
	it('sits at the default while the library is empty and follows the ratings as they come', () => {
		expect(globalMeanOf(readTotals(undefined))).toBeCloseTo(3.8);
		const busy = globalMeanOf({ ratingTotal: 4.5 * 500, ratingCount: 500 });
		expect(busy).toBeGreaterThan(4.4);
		expect(libraryGlobalMean(0, 0, 3.8, 5)).toBeCloseTo(3.8);
	});
});

describe('tagDelta', () => {
	it('adds all on first publish, the difference on edit, removes all on unpublish', () => {
		expect(tagDelta([], ['a', 'b'])).toEqual({ add: ['a', 'b'], remove: [] });
		expect(tagDelta(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
		expect(tagDelta(['a', 'b'], [])).toEqual({ add: [], remove: ['a', 'b'] });
	});
});

describe('isScenarioCoverUrl', () => {
	const good =
		'https://firebasestorage.googleapis.com/v0/b/bucket/o/agora%2Fsc-1%2Flibrary-cover.webp?alt=media&token=t';

	it('accepts a download URL inside the scenario folder', () => {
		expect(isScenarioCoverUrl(good, 'sc-1')).toBe(true);
	});

	it("refuses another scenario's folder, other hosts and junk", () => {
		expect(isScenarioCoverUrl(good, 'sc-2')).toBe(false);
		expect(isScenarioCoverUrl('https://evil.example.com/agora/sc-1/x.png', 'sc-1')).toBe(false);
		expect(isScenarioCoverUrl('javascript:alert(1)', 'sc-1')).toBe(false);
		expect(isScenarioCoverUrl('not a url', 'sc-1')).toBe(false);
	});
});

describe('chunkStrings', () => {
	it('keeps every index exactly once, in order, in bounded runs', () => {
		const strings = Array.from({ length: 150 }, (_, index) => `s${index}`);
		const chunks = chunkStrings(strings);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.length <= 60)).toBe(true);
		expect(chunks.flat()).toEqual(strings.map((_, index) => index));
	});

	it('splits on size as well as count', () => {
		const long = 'x'.repeat(5000);
		expect(chunkStrings([long, long, long]).length).toBeGreaterThan(1);
	});
});

describe('allowances', () => {
	const noon = Date.parse('2026-10-14T12:00:00Z');

	it('lets a teacher take thirty copies a day, then stops', () => {
		const day = dayKey(noon);
		expect(countCopy(undefined, noon)).toEqual({ copiesDay: day, copiesToday: 1 });
		expect(countCopy({ copiesDay: day, copiesToday: 29 }, noon)).toEqual({
			copiesDay: day,
			copiesToday: 30,
		});
		expect(countCopy({ copiesDay: day, copiesToday: 30 }, noon)).toBeNull();
		// A new day starts again
		expect(countCopy({ copiesDay: '2026-10-13', copiesToday: 30 }, noon)).toEqual({
			copiesDay: day,
			copiesToday: 1,
		});
	});

	it('lets a teacher mint five tags in a rolling week, then stops', () => {
		expect(countTag(undefined, noon)).toEqual({ tagsWeekStart: noon, tagsThisWeek: 1 });
		expect(countTag({ tagsWeekStart: noon - 1000, tagsThisWeek: 4 }, noon)).toEqual({
			tagsWeekStart: noon - 1000,
			tagsThisWeek: 5,
		});
		expect(countTag({ tagsWeekStart: noon - 1000, tagsThisWeek: 5 }, noon)).toBeNull();
		expect(countTag({ tagsWeekStart: noon - WEEK_MS - 1, tagsThisWeek: 5 }, noon)).toEqual({
			tagsWeekStart: noon,
			tagsThisWeek: 1,
		});
	});
});
