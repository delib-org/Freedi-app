import { AgoraSessionStatus, AgoraStage } from '@freedi/shared-types';

/**
 * Whether the teacher's screens may offer the lesson's join door — the QR
 * and the code — after the lobby. Students never get one: letting a classmate
 * in is the teacher's call.
 *
 * `agoraJoinSession` seats anyone whose code matches a session that is `open`
 * or `live`, at any stage: a latecomer lands on the station the room is on and
 * can catch up at the earlier ones (`stageAccess.ts`). So the door is worth
 * showing for as long as that is true, and not a moment longer — a QR for an
 * ended lesson is a QR that answers "not found".
 */
export function canInviteToSession(
	status: AgoraSessionStatus | undefined,
	stage: AgoraStage | undefined,
	code: string | undefined,
): boolean {
	if (!code) return false;
	if (status !== AgoraSessionStatus.open && status !== AgoraSessionStatus.live) return false;

	return stage !== AgoraStage.ended;
}

/**
 * Whether the projector draws a QR: always the big one in the lobby, and
 * after it the small one only while the teacher has switched it on
 * (`session.projectorQr`, absent = off).
 */
export function projectorShowsQr(
	status: AgoraSessionStatus | undefined,
	stage: AgoraStage | undefined,
	code: string | undefined,
	projectorQr: boolean | undefined,
): boolean {
	if (!canInviteToSession(status, stage, code)) return false;

	return stage === AgoraStage.lobby || projectorQr === true;
}
