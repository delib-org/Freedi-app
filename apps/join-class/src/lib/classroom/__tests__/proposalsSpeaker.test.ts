import { describe, expect, it } from 'vitest';
import { proposalsSpeakerOf } from '../proposalsSpeaker';

const NOW = 1_800_000_000_000;
const SECOND = 1000;

describe('proposalsSpeakerOf', () => {
	it('names the speaker and the time left while a minute runs', () => {
		expect(
			proposalsSpeakerOf(
				{ step: 'talk', speakerUid: 'dana', speakerEndsAt: NOW + 45 * SECOND },
				NOW,
			),
		).toEqual({ kind: 'speaking', uid: 'dana', msLeft: 45 * SECOND });
	});

	it('says nobody once the minute is over, or when nobody was ever given the floor', () => {
		expect(
			proposalsSpeakerOf({ step: 'talk', speakerUid: 'dana', speakerEndsAt: NOW }, NOW),
		).toEqual({ kind: 'nobody' });
		expect(proposalsSpeakerOf({ step: 'talk' }, NOW)).toEqual({ kind: 'nobody' });
		expect(proposalsSpeakerOf({ step: 'talk', speakerEndsAt: NOW + SECOND }, NOW)).toEqual({
			kind: 'nobody',
		});
	});

	it('shows nothing outside the talk step', () => {
		expect(
			proposalsSpeakerOf({ step: 'write', speakerUid: 'dana', speakerEndsAt: NOW + SECOND }, NOW),
		).toBeNull();
	});
});
