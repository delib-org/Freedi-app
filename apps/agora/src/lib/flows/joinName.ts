import { AgoraSessionMode } from '@freedi/shared-types';

/** The slice of a session the door needs to decide what to ask */
export interface JoinNameSession {
	identity?: 'pseudonym' | 'named';
	classId?: string;
	sessionMode?: AgoraSessionMode;
	collectRealNames?: boolean;
}

/**
 * What the door asks for, if anything.
 *
 * `named`: the name goes on the cards (the room is a family or a small team)
 * and doubles as the teacher's real name. `real`: a classroom — the name is
 * for the teacher alone and the cards keep their pseudonyms; class games ask
 * too, because a roster alias is a nickname, not a name. `none`: a civic
 * square (nobody to read it) or a lesson that opted out.
 */
export function joinNamePhase(session: JoinNameSession): 'named' | 'real' | 'none' {
	if (session.sessionMode === AgoraSessionMode.civic) return 'none';
	if (session.identity === 'named' && !session.classId) return 'named';
	if (session.collectRealNames === false) return 'none';

	return 'real';
}
