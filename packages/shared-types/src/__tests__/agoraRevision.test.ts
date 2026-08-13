import { assessRevision, countChangedWords } from '../models/agora/agoraRevision';
import { AGORA_ANTI_GAMING, AGORA_POINTS } from '../models/agora/agoraConstants';

const NOW = 1_000_000_000;
const DEBOUNCE = AGORA_ANTI_GAMING.REVISION_DEBOUNCE_MS;

const base = {
	prevText: 'we share the bread between the palace and the square',
	newText: 'we share the bread and the taxes between the palace and the square fairly',
	now: NOW,
	creditedRevisions: 0,
	studentRatingsNow: 2,
};

describe('countChangedWords', () => {
	it('counts added words', () => {
		expect(countChangedWords('a b c', 'a b c d e')).toBe(2);
	});

	it('counts removed words', () => {
		expect(countChangedWords('a b c d', 'a d')).toBe(2);
	});

	it('counts replacements as removed + added', () => {
		expect(countChangedWords('the king taxes bread', 'the king shares bread')).toBe(2);
	});

	it('ignores whitespace, case and edge punctuation', () => {
		expect(countChangedWords('The  king, taxes bread.', 'the king taxes bread')).toBe(0);
	});

	it('handles empty sides', () => {
		expect(countChangedWords('', 'one two three')).toBe(3);
		expect(countChangedWords('one two', '')).toBe(2);
		expect(countChangedWords('', '')).toBe(0);
	});

	it('counts reordering as change', () => {
		expect(countChangedWords('a b c', 'c a b')).toBeGreaterThan(0);
	});

	it('handles Hebrew text', () => {
		expect(countChangedWords('נחלק את הלחם', 'נחלק את הלחם ואת המסים בהגינות')).toBe(3);
	});
});

describe('assessRevision', () => {
	describe('delta gate', () => {
		it('below MIN_REVISION_DELTA_WORDS is not a revision at all', () => {
			const r = assessRevision({
				...base,
				newText: 'we share the bread between the palace and the square now',
			});
			expect(r.realChange).toBe(false);
			expect(r.isNewEvent).toBe(false);
			expect(r.mergeIntoLastEvent).toBe(false);
			expect(r.credit).toBe(0);
		});

		it('at or above the threshold is a real change', () => {
			const r = assessRevision(base);
			expect(r.realChange).toBe(true);
			expect(r.changedWords).toBeGreaterThanOrEqual(
				AGORA_ANTI_GAMING.MIN_REVISION_DELTA_WORDS,
			);
		});
	});

	describe('debounce', () => {
		it('first real change opens a new event', () => {
			const r = assessRevision(base);
			expect(r.isNewEvent).toBe(true);
			expect(r.mergeIntoLastEvent).toBe(false);
		});

		it('a real change inside the window merges into the last event and never pays', () => {
			const r = assessRevision({
				...base,
				lastEventAt: NOW - DEBOUNCE + 1000,
			});
			expect(r.isNewEvent).toBe(false);
			expect(r.mergeIntoLastEvent).toBe(true);
			expect(r.credit).toBe(0);
		});

		it('a real change at exactly the window boundary opens a new event', () => {
			const r = assessRevision({
				...base,
				lastEventAt: NOW - DEBOUNCE,
			});
			expect(r.isNewEvent).toBe(true);
		});
	});

	describe('feedback gate', () => {
		it('never credited + no ratings + no thanks → no credit', () => {
			const r = assessRevision({ ...base, studentRatingsNow: 0 });
			expect(r.feedbackSinceCredit).toBe(false);
			expect(r.credit).toBe(0);
			// Still a real event — the journey records it, the wallet doesn't.
			expect(r.isNewEvent).toBe(true);
		});

		it('never credited + a thank counts as feedback even with zero ratings', () => {
			const r = assessRevision({
				...base,
				studentRatingsNow: 0,
				lastThankAt: NOW - 60_000,
			});
			expect(r.feedbackSinceCredit).toBe(true);
			expect(r.credit).toBe(AGORA_POINTS.REVISION_CREDIT);
		});

		it('already credited: the same ratings cannot pay twice', () => {
			const r = assessRevision({
				...base,
				creditedRevisions: 1,
				lastCreditAt: NOW - 10 * 60_000,
				studentRatingsAtCredit: 2,
				studentRatingsNow: 2,
			});
			expect(r.feedbackSinceCredit).toBe(false);
			expect(r.credit).toBe(0);
		});

		it('already credited: a NEW rating re-arms the credit', () => {
			const r = assessRevision({
				...base,
				creditedRevisions: 1,
				lastCreditAt: NOW - 10 * 60_000,
				studentRatingsAtCredit: 2,
				studentRatingsNow: 3,
			});
			expect(r.credit).toBe(AGORA_POINTS.REVISION_CREDIT);
			expect(r.isFirstCredit).toBe(false);
		});

		it('already credited: a thank AFTER the last credit re-arms it', () => {
			const r = assessRevision({
				...base,
				creditedRevisions: 1,
				lastCreditAt: NOW - 10 * 60_000,
				studentRatingsAtCredit: 2,
				studentRatingsNow: 2,
				lastThankAt: NOW - 5 * 60_000,
			});
			expect(r.credit).toBe(AGORA_POINTS.REVISION_CREDIT);
		});

		it('a thank BEFORE the last credit does not re-arm it', () => {
			const r = assessRevision({
				...base,
				creditedRevisions: 1,
				lastCreditAt: NOW - 10 * 60_000,
				studentRatingsAtCredit: 2,
				studentRatingsNow: 2,
				lastThankAt: NOW - 20 * 60_000,
			});
			expect(r.credit).toBe(0);
		});
	});

	describe('cap', () => {
		it('stops paying at MAX_REVISION_CREDITS but the event still happens', () => {
			const r = assessRevision({
				...base,
				creditedRevisions: AGORA_POINTS.MAX_REVISION_CREDITS,
				lastCreditAt: NOW - 30 * 60_000,
				studentRatingsAtCredit: 1,
				studentRatingsNow: 9,
			});
			expect(r.credit).toBe(0);
			expect(r.isNewEvent).toBe(true);
		});
	});

	describe('first credit', () => {
		it('flags only the first credited revision', () => {
			expect(assessRevision(base).isFirstCredit).toBe(true);
			expect(
				assessRevision({
					...base,
					creditedRevisions: 1,
					lastCreditAt: NOW - 10 * 60_000,
					studentRatingsAtCredit: 1,
					studentRatingsNow: 5,
				}).isFirstCredit,
			).toBe(false);
		});
	});
});
