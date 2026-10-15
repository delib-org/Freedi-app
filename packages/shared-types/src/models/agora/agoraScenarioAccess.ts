import type { AgoraTopicPackage } from './agoraTopicPackage';

/**
 * Who may open a scenario (an `AgoraTopicPackage`) by its id.
 *
 * A PUBLIC scenario is open to any signed-in user. A private one — every
 * scenario that is not public, including one that was never published — is
 * open to its author, to a system admin, and to the people playing a game
 * built on it. The last group is not something the rules can discover from
 * the package alone, so the server leaves a reader marker,
 * `agoraTopicReaders/{topicPackageId}--{uid}`, for each of them: when a
 * player joins (`agoraJoinSession`), or when someone already in the session
 * asks for it (`agoraTopicAccess`, the fallback for a player seated before
 * markers existed). The rules read that marker with one `exists()`.
 */

/** One person's standing permission to read one private scenario, written by the server only */
export interface AgoraTopicReader {
	topicPackageId: string;
	uid: string;
	/** The session that earned the permission (the first one, if several did) */
	sessionId: string;
	grantedAt: number;
}

export function createAgoraTopicReaderId(topicPackageId: string, uid: string): string {
	return `${topicPackageId}--${uid}`;
}

/** Private means "not public": an absent `visibility` is private too */
export function isPrivateScenario(pkg: Pick<AgoraTopicPackage, 'visibility'>): boolean {
	return pkg.visibility !== 'public';
}

/**
 * Whether a viewer may read the scenario without a reader marker. The same
 * test the security rules make, for callables that serve scenarios with the
 * admin SDK (which the rules do not see).
 */
export function canOpenScenario(
	pkg: Pick<AgoraTopicPackage, 'visibility' | 'creatorId'>,
	viewer: { uid: string; isSystemAdmin: boolean },
): boolean {
	return !isPrivateScenario(pkg) || pkg.creatorId === viewer.uid || viewer.isSystemAdmin;
}

/** `agoraTopicAccess`: someone in a session asks to read the scenario it is playing */
export interface TopicAccessRequest {
	sessionId: string;
}

export interface TopicAccessResponse {
	topicPackageId: string;
	/** True when a reader marker exists for the caller now (or none was needed) */
	granted: boolean;
}
