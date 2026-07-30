import { describe, it, expect } from 'vitest';
import { shouldBeep, type BeepDecisionInput } from '../chat/authorCommentAlerts';

function baseInput(overrides: Partial<BeepDecisionInput> = {}): BeepDecisionInput {
	return {
		isMine: true,
		prevLatest: 1000,
		latestTs: 2000,
		visible: true,
		isViewingOption: false,
		now: 100_000,
		lastBeepAt: 0,
		muted: false,
		...overrides,
	};
}

describe('shouldBeep', () => {
	it('beeps when a fresh comment lands on my option while visible', () => {
		expect(shouldBeep(baseInput())).toBe(true);
	});

	it('never beeps for options I did not author', () => {
		expect(shouldBeep(baseInput({ isMine: false }))).toBe(false);
	});

	it('records silently on first sighting (initial snapshot absorption)', () => {
		expect(shouldBeep(baseInput({ prevLatest: undefined }))).toBe(false);
	});

	it('ignores deliveries that do not advance the latest timestamp', () => {
		expect(shouldBeep(baseInput({ latestTs: 1000 }))).toBe(false);
		expect(shouldBeep(baseInput({ latestTs: 900 }))).toBe(false);
	});

	it('stays silent when the tab is hidden', () => {
		expect(shouldBeep(baseInput({ visible: false }))).toBe(false);
	});

	it('stays silent while the author is already reading that thread', () => {
		expect(shouldBeep(baseInput({ isViewingOption: true }))).toBe(false);
	});

	it('throttles beeps within 4 seconds of the previous one', () => {
		expect(shouldBeep(baseInput({ now: 100_000, lastBeepAt: 97_000 }))).toBe(false);
		expect(shouldBeep(baseInput({ now: 100_000, lastBeepAt: 95_000 }))).toBe(true);
	});

	it('respects the mute flag', () => {
		expect(shouldBeep(baseInput({ muted: true }))).toBe(false);
	});
});
