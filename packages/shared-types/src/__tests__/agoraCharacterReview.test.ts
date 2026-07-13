import {
	createAgoraCharacterReviewId,
	createAgoraAiRaterUid,
	isAgoraAiUid,
	agoraScoreToEvaluation,
} from '../models/agora/agoraCharacterReview';
import { AGORA_AI_REVIEW } from '../models/agora/agoraConstants';

describe('agoraScoreToEvaluation', () => {
	it('maps the 0-100 scale onto -1..+1', () => {
		expect(agoraScoreToEvaluation(0)).toBe(-1);
		expect(agoraScoreToEvaluation(25)).toBe(-0.5);
		expect(agoraScoreToEvaluation(50)).toBe(0);
		expect(agoraScoreToEvaluation(75)).toBe(0.5);
		expect(agoraScoreToEvaluation(100)).toBe(1);
	});

	it('clamps out-of-range scores', () => {
		expect(agoraScoreToEvaluation(-20)).toBe(-1);
		expect(agoraScoreToEvaluation(150)).toBe(1);
	});

	it('rounds to two decimals', () => {
		expect(agoraScoreToEvaluation(33)).toBe(-0.34);
		expect(agoraScoreToEvaluation(67)).toBe(0.34);
	});
});

describe('id helpers', () => {
	it('builds the review doc id from statement and character', () => {
		expect(createAgoraCharacterReviewId('st1', 'char-a')).toBe('st1--char-a');
	});

	it('builds deterministic AI rater uids with the shared prefix', () => {
		const uid = createAgoraAiRaterUid('char-a', 2);
		expect(uid).toBe(`${AGORA_AI_REVIEW.AI_UID_PREFIX}char-a--2`);
	});

	it('recognises AI uids and rejects student uids', () => {
		expect(isAgoraAiUid(createAgoraAiRaterUid('char-a', 1))).toBe(true);
		expect(isAgoraAiUid('some-student-uid')).toBe(false);
	});
});
