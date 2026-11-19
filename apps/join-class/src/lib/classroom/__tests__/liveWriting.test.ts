import { describe, expect, it } from 'vitest';
import type { LiveDraft } from '@/lib/liveDrafts';
import { penTextOf, writerName } from '../liveWriting';

function draft(userId: string, text: string, displayName = userId): LiveDraft {
	return { userId, displayName, color: '', text, lastUpdate: 1000, reactions: [] };
}

describe('penTextOf', () => {
	const drafts = [draft('noa', 'plant trees'), draft('me', 'mine'), draft('dan', 'other')];

	it("is the pen holder's text, as typed so far", () => {
		expect(penTextOf(drafts, 'noa', 'me')).toBe('plant trees');
	});

	it('is empty when nobody holds the pen, when I hold it, or when the draft has not arrived', () => {
		expect(penTextOf(drafts, undefined, 'me')).toBe('');
		expect(penTextOf(drafts, 'me', 'me')).toBe('');
		expect(penTextOf(drafts, 'yossi', 'me')).toBe('');
	});

	it('shows only the pen holder: a stale draft of someone who gave the pen back is not read', () => {
		expect(penTextOf(drafts, 'dan', 'me')).toBe('other');
		expect(
			penTextOf(
				drafts.filter((d) => d.userId !== 'noa'),
				'dan',
				'me',
			),
		).toBe('other');
	});
});

describe('writerName', () => {
	const roster = [
		{ uid: 'noa', name: 'Noa' },
		{ uid: 'dan', name: 'someone' },
	];

	it("uses the table roster's name, as the chips do", () => {
		expect(writerName('noa', 'noa_x', roster, 'someone')).toBe('Noa');
	});

	it('falls back to the broadcast name when the roster only knows "someone"', () => {
		expect(writerName('dan', 'Daniel', roster, 'someone')).toBe('Daniel');
		expect(writerName('zed', 'Zed', roster, 'someone')).toBe('Zed');
	});
});
