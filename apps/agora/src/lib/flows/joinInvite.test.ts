import { describe, expect, it } from 'vitest';
import { AgoraSessionStatus, AgoraStage } from '@freedi/shared-types';
import { canInviteToSession, projectorShowsQr } from './joinInvite';

describe('canInviteToSession', () => {
	it('offers the door in the lobby and on every stage of a running lesson', () => {
		expect(canInviteToSession(AgoraSessionStatus.open, AgoraStage.lobby, '12345')).toBe(true);
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.question, '12345')).toBe(true);
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.voting, '01234')).toBe(true);
		// The join callable still seats a latecomer at the results
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.results, '12345')).toBe(true);
	});

	it('hides it once the lesson has ended — the code would answer "not found"', () => {
		expect(canInviteToSession(AgoraSessionStatus.ended, AgoraStage.results, '12345')).toBe(false);
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.ended, '12345')).toBe(false);
	});

	it('hides it while the session or its code is not known yet', () => {
		expect(canInviteToSession(undefined, AgoraStage.lobby, '12345')).toBe(false);
		expect(canInviteToSession(AgoraSessionStatus.live, undefined, '12345')).toBe(true);
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.question, '')).toBe(false);
		expect(canInviteToSession(AgoraSessionStatus.live, AgoraStage.question, undefined)).toBe(false);
	});
});

describe('projectorShowsQr', () => {
	const { live, ended } = AgoraSessionStatus;

	it('always shows the big QR in the lobby', () => {
		expect(projectorShowsQr(AgoraSessionStatus.open, AgoraStage.lobby, '12345', undefined)).toBe(
			true,
		);
		expect(projectorShowsQr(AgoraSessionStatus.open, AgoraStage.lobby, '12345', false)).toBe(true);
	});

	it('after the lobby, only while the teacher has switched it on', () => {
		expect(projectorShowsQr(live, AgoraStage.question, '12345', undefined)).toBe(false);
		expect(projectorShowsQr(live, AgoraStage.question, '12345', false)).toBe(false);
		expect(projectorShowsQr(live, AgoraStage.question, '12345', true)).toBe(true);
	});

	it('never once the lesson has ended, switch or not', () => {
		expect(projectorShowsQr(ended, AgoraStage.results, '12345', true)).toBe(false);
		expect(projectorShowsQr(live, AgoraStage.ended, '12345', true)).toBe(false);
	});
});
