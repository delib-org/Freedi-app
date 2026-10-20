import { describe, expect, it } from 'vitest';
import type { OdysseyElder } from '@freedi/shared-types';
import type { IslandContent } from '../game';
import {
	aiPersonaNote,
	crewCounsel,
	crewShoreCounsel,
	islandCounsel,
	islandLean,
	shoreCounsel,
	silentLine,
} from '../counsel';
import he from '../../i18n/locales/he';

function island(statementId: string, stanceIds: string[]): IslandContent {
	return {
		statementId,
		stances: stanceIds.map((id) => ({ statementId: id, statement: `shore ${id}` })),
	} as unknown as IslandContent;
}

function elder(overrides: Partial<OdysseyElder> = {}): OdysseyElder {
	return {
		elderId: 'bg',
		name: 'דוד בן-גוריון',
		role: 'ראש הממשלה הראשון',
		portraitUrl: null,
		color: '#1f4e79',
		bio: '',
		needs: [],
		values: [{ valueId: 'mamlachtiut', label: 'ממלכתיות', description: '' }],
		positions: { i1: 's2' },
		reactions: { s1: 'oppose-line', s2: 'agree-line' },
		challenges: { i1: 'challenge-line' },
		sortOrder: 1,
		enabled: true,
		...overrides,
	};
}

const i1 = island('i1', ['s1', 's2', 's3']);
const [s1, s2, s3] = i1.stances;

describe('copy', () => {
	it('names a lean, not a stance, and keeps the one persona note', () => {
		// Hebrew is the test language (no locale chunk is loaded here).
		expect(silentLine()).toBe(he['counsel.silent']);
		expect(silentLine()).toBe('אין לי נטייה מתועדת כאן. כאן אני מקשיב/ה, לא מדבר/ת.');
		expect(silentLine()).not.toContain('עמדה');
		expect(aiPersonaNote()).toBe(he['counsel.personaNote']);
		expect(aiPersonaNote()).toBe('📜 דמות בינה מלאכותית — שחזור משוער, לא ציטוט ולא המלצת הצבעה');
	});
});

describe('islandCounsel', () => {
	it('gives the declared shore and the authored line', () => {
		const counsel = islandCounsel(elder(), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.leansTo?.statementId).toBe('s2');
		expect(counsel.shoreNumber).toBe(2);
		expect(counsel.line).toBe('challenge-line');
	});

	it('is silent where the sailor has no record', () => {
		const counsel = islandCounsel(elder(), island('i9', ['x1']));
		expect(counsel).toMatchObject({ silent: true, leansTo: null, shoreNumber: null, line: null });
		expect(silentLine()).toContain('מקשיב');
	});

	it('never uses the agree/oppose reactions — those answer a mark, not a question', () => {
		const counsel = islandCounsel(elder({ challenges: {} }), i1);
		expect(counsel.line).not.toBe('agree-line');
		expect(counsel.line).not.toBe('oppose-line');
	});

	it('falls back to a values line for an elder authored before challenges existed', () => {
		const counsel = islandCounsel(elder({ challenges: {} }), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.line).toContain('ממלכתיות');
	});

	it('speaks without leaning when a challenge exists but no shore was declared', () => {
		const counsel = islandCounsel(elder({ positions: {} }), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.leansTo).toBeNull();
		expect(counsel.line).toBe('challenge-line');
	});

	it('treats a declared shore that no longer exists on the island as no shore', () => {
		const counsel = islandCounsel(elder({ positions: { i1: 'gone' } }), i1);
		expect(counsel.leansTo).toBeNull();
		expect(counsel.line).toBe('challenge-line');
	});

	it('ignores per-shore counsel lines: the island card speaks about the island', () => {
		const counsel = islandCounsel(elder({ counsel: { i1: { s2: 'shore-2-line' } } }), i1);
		expect(counsel.line).toBe('challenge-line');
	});
});

describe('islandLean', () => {
	it('points at the declared shore by number, with its text', () => {
		expect(islandLean(islandCounsel(elder(), i1))).toEqual({
			kind: 'shore',
			number: 2,
			text: 'shore s2',
		});
	});

	it('is silent with no declared shore, even when the sailor has a line', () => {
		expect(islandLean(islandCounsel(elder({ positions: {} }), i1))).toEqual({ kind: 'silent' });
	});
});

describe('crewCounsel', () => {
	it('answers for every crew member, in crew order, the same way', () => {
		const crew = [elder(), elder({ elderId: 'golda', positions: {}, challenges: {}, values: [] })];
		const all = crewCounsel(crew, i1);
		expect(all.map((entry) => entry.elder.elderId)).toEqual(['bg', 'golda']);
		expect(all.map((entry) => entry.silent)).toEqual([false, true]);
	});
});

describe('shoreCounsel', () => {
	const authored = elder({
		counsel: { i1: { s1: 'why shore 1?', s2: 'why shore 2?' } },
	});

	describe('lean', () => {
		it('leans here on the declared shore', () => {
			expect(shoreCounsel(authored, i1, s2).lean).toEqual({ kind: 'here' });
		});

		it('leans to shore N, by number and text, on any other shore', () => {
			expect(shoreCounsel(authored, i1, s1).lean).toEqual({
				kind: 'shore',
				number: 2,
				text: 'shore s2',
			});
			expect(shoreCounsel(authored, i1, s3).lean).toEqual({
				kind: 'shore',
				number: 2,
				text: 'shore s2',
			});
		});

		it('is silent with no documented position on the island', () => {
			expect(shoreCounsel(elder({ positions: {} }), i1, s1).lean).toEqual({ kind: 'silent' });
		});

		it('is silent when the declared shore no longer exists on the island', () => {
			expect(shoreCounsel(elder({ positions: { i1: 'gone' } }), i1, s1).lean).toEqual({
				kind: 'silent',
			});
		});
	});

	describe('line', () => {
		it('uses the authored shore line for that shore, and says it is about the shore', () => {
			expect(shoreCounsel(authored, i1, s1)).toMatchObject({
				line: 'why shore 1?',
				lineAboutIsland: false,
			});
			expect(shoreCounsel(authored, i1, s2)).toMatchObject({
				line: 'why shore 2?',
				lineAboutIsland: false,
			});
		});

		it('falls back to the island line, labelled as such, on a shore with no authored line', () => {
			expect(shoreCounsel(authored, i1, s3)).toMatchObject({
				line: 'challenge-line',
				lineAboutIsland: true,
			});
		});

		it('falls back to the island line when `counsel` is missing altogether', () => {
			const counsel = shoreCounsel(elder(), i1, s1);
			expect(counsel.elder.counsel).toBeUndefined();
			expect(counsel).toMatchObject({ line: 'challenge-line', lineAboutIsland: true });
		});

		it('falls back through the island line to the values line', () => {
			expect(shoreCounsel(elder({ challenges: {} }), i1, s1)).toMatchObject({
				lineAboutIsland: true,
			});
			expect(shoreCounsel(elder({ challenges: {} }), i1, s1).line).toContain('ממלכתיות');
		});

		it('has no line, and says nothing is about the island, for a sailor with no record', () => {
			const counsel = shoreCounsel(elder({ positions: {}, challenges: {}, values: [] }), i1, s1);
			expect(counsel).toMatchObject({
				lean: { kind: 'silent' },
				line: null,
				lineAboutIsland: false,
			});
		});

		it('treats a blank authored line as unauthored', () => {
			expect(shoreCounsel(elder({ counsel: { i1: { s1: '   ' } } }), i1, s1)).toMatchObject({
				line: 'challenge-line',
				lineAboutIsland: true,
			});
		});

		it('never uses the agree/oppose reactions in the question phase', () => {
			for (const stance of i1.stances) {
				const { line } = shoreCounsel(elder({ challenges: {}, values: [] }), i1, stance);
				expect(line).not.toBe('agree-line');
				expect(line).not.toBe('oppose-line');
			}
		});
	});

	it('carries the shore it answers', () => {
		expect(shoreCounsel(authored, i1, s3).stance.statementId).toBe('s3');
	});
});

describe('crewShoreCounsel', () => {
	it('answers for every crew member, in crew order, the same way', () => {
		const crew = [elder({ elderId: 'golda', positions: {}, challenges: {}, values: [] }), elder()];
		const all = crewShoreCounsel(crew, i1, s2);
		expect(all.map((entry) => entry.elder.elderId)).toEqual(['golda', 'bg']);
		expect(all.map((entry) => entry.lean.kind)).toEqual(['silent', 'here']);
	});
});
