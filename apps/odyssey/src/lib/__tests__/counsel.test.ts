import { describe, expect, it } from 'vitest';
import type { OdysseyElder } from '@freedi/shared-types';
import type { IslandContent } from '../game';
import { SILENT_LINE, crewCounsel, elderCounsel } from '../counsel';

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

describe('elderCounsel', () => {
	it('gives the declared shore and the authored line', () => {
		const counsel = elderCounsel(elder(), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.leansTo?.statementId).toBe('s2');
		expect(counsel.shoreNumber).toBe(2);
		expect(counsel.line).toBe('challenge-line');
	});

	it('is silent where the sailor has no record', () => {
		const counsel = elderCounsel(elder(), island('i9', ['x1']));
		expect(counsel).toMatchObject({ silent: true, leansTo: null, shoreNumber: null, line: null });
		expect(SILENT_LINE).toContain('מקשיב');
	});

	it('never uses the agree/oppose reactions — those answer a mark, not a question', () => {
		const counsel = elderCounsel(elder({ challenges: {} }), i1);
		expect(counsel.line).not.toBe('agree-line');
		expect(counsel.line).not.toBe('oppose-line');
	});

	it('falls back to a values line for an elder authored before challenges existed', () => {
		const counsel = elderCounsel(elder({ challenges: {} }), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.line).toContain('ממלכתיות');
	});

	it('speaks without leaning when a challenge exists but no shore was declared', () => {
		const counsel = elderCounsel(elder({ positions: {} }), i1);
		expect(counsel.silent).toBe(false);
		expect(counsel.leansTo).toBeNull();
		expect(counsel.line).toBe('challenge-line');
	});

	it('treats a declared shore that no longer exists on the island as no shore', () => {
		const counsel = elderCounsel(elder({ positions: { i1: 'gone' } }), i1);
		expect(counsel.leansTo).toBeNull();
		expect(counsel.line).toBe('challenge-line');
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
