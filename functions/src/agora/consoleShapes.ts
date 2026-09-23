import {
	AgoraClassMember,
	AgoraSession,
	SupervisorSessionRow,
	TeacherConsoleMember,
	deriveLessonSpan,
} from '@freedi/shared-types';

/**
 * The projections the consoles hand out — pure, so the shape a teacher or a
 * supervisor sees is tested in node and can never drift between the two
 * callables that serve it.
 */

/** The roster as a console sees it — never the PIN hash or uid history. */
export function toTeacherMember(member: AgoraClassMember): TeacherConsoleMember {
	return {
		memberId: member.memberId,
		alias: member.alias,
		joinedAt: member.joinedAt,
		lastActive: member.lastActive,
	};
}

/**
 * A session as the supervisor sees it: what was played, when, for how long,
 * and how it went — never the raw doc (which carries the teacher's private
 * settings, the ballot, the debrief text).
 */
export function toSupervisorSessionRow(session: AgoraSession): SupervisorSessionRow {
	const span = deriveLessonSpan(session);
	const convergenceScore = session.convergence?.score;

	return {
		sessionId: session.sessionId,
		topicPackageId: session.topicPackageId,
		teacherId: session.teacherId,
		...(session.classId ? { classId: session.classId } : {}),
		createdAt: session.createdAt,
		status: session.status,
		stage: session.stage,
		participantCount: session.participantCount,
		startedAt: span.startedAt,
		durationMs: span.durationMs,
		playedAt: session.classScore?.computedAt ?? session.agreement?.computedAt ?? span.endedAt,
		...(session.classScore ? { classScoreTotal: session.classScore.total } : {}),
		...(convergenceScore !== null && convergenceScore !== undefined ? { convergenceScore } : {}),
		...(session.classScore?.outcome ? { outcome: session.classScore.outcome } : {}),
	};
}
