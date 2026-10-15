import { safeParse } from 'valibot';
import {
	AGORA_POINTS,
	AgoraParticipantSchema,
	AgoraTeacherMessageSchema,
	applyLanguageStrike,
} from '../models/agora';

const points = { valueAccuracy: 0, proposals: 3, helping: 2, total: 5 };

describe('applyLanguageStrike', () => {
	it('takes the penalty, counts the strike and stamps the clock', () => {
		const outcome = applyLanguageStrike({ points }, 1000);
		expect(outcome.deducted).toBe(AGORA_POINTS.LANGUAGE_PENALTY);
		expect(outcome.points.total).toBe(5 - AGORA_POINTS.LANGUAGE_PENALTY);
		expect(outcome.points.penalties).toBe(AGORA_POINTS.LANGUAGE_PENALTY);
		expect(outcome.languageStrikes).toBe(1);
		expect(outcome.lastLanguageStrikeAt).toBe(1000);
	});

	it('accumulates strikes and penalties across refusals', () => {
		const first = applyLanguageStrike({ points }, 1);
		const second = applyLanguageStrike(
			{ points: first.points, languageStrikes: first.languageStrikes },
			2,
		);
		expect(second.languageStrikes).toBe(2);
		expect(second.points.penalties).toBe(2 * AGORA_POINTS.LANGUAGE_PENALTY);
		expect(second.points.total).toBe(5 - 2 * AGORA_POINTS.LANGUAGE_PENALTY);
	});

	it('floors the balance at zero but still counts the strike', () => {
		const outcome = applyLanguageStrike({ points: { ...points, total: 1 }, languageStrikes: 4 }, 7);
		expect(outcome.deducted).toBe(1);
		expect(outcome.points.total).toBe(0);
		expect(outcome.points.penalties).toBe(1);
		expect(outcome.languageStrikes).toBe(5);

		const broke = applyLanguageStrike({ points: outcome.points, languageStrikes: 5 }, 8);
		expect(broke.deducted).toBe(0);
		expect(broke.points.total).toBe(0);
		expect(broke.languageStrikes).toBe(6);
	});

	it('leaves the other point categories alone', () => {
		const outcome = applyLanguageStrike({ points }, 1);
		expect(outcome.points.proposals).toBe(points.proposals);
		expect(outcome.points.helping).toBe(points.helping);
	});
});

describe('language strike schemas', () => {
	it('accepts the strike fields on a participant and the system language line', () => {
		const participant = safeParse(AgoraParticipantSchema, {
			participantId: 's--u',
			sessionId: 's',
			userId: 'u',
			anonName: 'Fox',
			points: { ...points, penalties: 2 },
			languageStrikes: 1,
			lastLanguageStrikeAt: 5,
			joinedAt: 1,
			lastActive: 1,
		});
		expect(participant.success).toBe(true);

		const line = safeParse(AgoraTeacherMessageSchema, {
			messageId: 'm',
			sessionId: 's',
			teacherId: 't',
			studentUid: 'u',
			from: 'system',
			kind: 'language',
			text: '',
			aboutStatementId: 'p',
			removedText: 'the refused words',
			createdAt: 1,
		});
		expect(line.success).toBe(true);
	});
});
