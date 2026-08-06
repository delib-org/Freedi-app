/**
 * Builders for the Statement documents Agora writes.
 *
 * Kept free of any Firestore import so the document shape can be asserted
 * against `StatementSchema` in a unit test: a proposal that fails that schema
 * is silently dropped by the shared `onStatementCreated` /
 * `updateEvaluation` pipeline, which is exactly the class of bug these
 * builders exist to prevent.
 */
import {
	AgoraSession,
	AgoraSuggestionStatus,
	SourceApp,
	Statement,
	StatementType,
	User,
	createStatementObject,
} from '@freedi/shared-types';

/**
 * The `creator` every Agora statement carries. Students stay anonymous to each
 * other, so the pseudonym — not the Google/anon account name — is what lands in
 * `displayName`: classmates read it straight back out, and so does the shared
 * notification fan-out. The real identity is `uid`, which only the server and
 * the security rules ever compare against.
 */
export function agoraCreator(uid: string, anonName: string): User {
	return {
		uid,
		displayName: anonName,
		email: null,
		photoURL: null,
		isAnonymous: true,
	};
}

/** A student's proposal: an option under the session's challenge question. */
export function buildProposalStatement(
	session: AgoraSession,
	statementId: string,
	uid: string,
	anonName: string,
	text: string,
): Statement {
	const statement = createStatementObject({
		statementId,
		statement: text,
		statementType: StatementType.option,
		parentId: session.challengeQuestionId,
		topParentId: session.rootStatementId,
		parents: [session.rootStatementId, session.challengeQuestionId],
		creatorId: uid,
		creator: agoraCreator(uid, anonName),
		sourceApp: SourceApp.AGORA,
		agoraSessionId: session.sessionId,
		anonName,
	});
	if (!statement) throw new Error('Failed to build proposal statement');

	return statement;
}

/** A peer improvement suggestion, parented on the proposal it is about. */
export function buildSuggestionStatement(
	session: AgoraSession,
	proposalId: string,
	statementId: string,
	uid: string,
	anonName: string,
	text: string,
): Statement {
	const statement = createStatementObject({
		statementId,
		statement: text,
		statementType: StatementType.suggestion,
		parentId: proposalId,
		topParentId: session.rootStatementId,
		parents: [session.rootStatementId, session.challengeQuestionId, proposalId],
		creatorId: uid,
		creator: agoraCreator(uid, anonName),
		sourceApp: SourceApp.AGORA,
		agoraSessionId: session.sessionId,
		anonName,
		suggestionStatus: AgoraSuggestionStatus.open,
	});
	if (!statement) throw new Error('Failed to build suggestion statement');

	return statement;
}
