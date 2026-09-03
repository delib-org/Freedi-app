import { describe, expect, it } from 'vitest';
import { AgoraSessionMode } from '@freedi/shared-types';
import { joinNamePhase } from '../flows/joinName';

describe('joinNamePhase', () => {
	it('asks a classroom for a real name by default', () => {
		expect(joinNamePhase({})).toBe('real');
		expect(joinNamePhase({ classId: 'c' })).toBe('real');
	});

	it('keeps the named room asking for the card name', () => {
		expect(joinNamePhase({ identity: 'named' })).toBe('named');
		// A class game already has an alias for the cards; the real name is still asked
		expect(joinNamePhase({ identity: 'named', classId: 'c' })).toBe('real');
	});

	it('asks nothing of a civic square or an opted-out lesson', () => {
		expect(joinNamePhase({ sessionMode: AgoraSessionMode.civic })).toBe('none');
		expect(joinNamePhase({ collectRealNames: false })).toBe('none');
	});
});
