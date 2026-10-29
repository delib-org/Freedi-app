import type { Statement } from '@freedi/shared-types';
import { gateOf } from '@/lib/classroom/classSettings';
import { onlyAboveGateOn, scopeCounts } from '@/lib/classroom/voteScope';
import { setVoteDisplay } from './consoleActions';
import type { VoteScopeAttrs } from './VoteScopeSwitch';

/**
 * What the Vote step's "proposals on the vote" switch shows: the teacher's
 * choice and the "N of M above the goal" counts. The counts cover the ballot
 * once it is open, otherwise every visible proposal of the challenge.
 */

export function voteScopeOf(
	challenge: Statement | null,
	main: Statement | null | undefined,
	proposals: readonly Statement[],
): VoteScopeAttrs {
	const ballotIds = challenge?.statementSettings?.ballot?.candidateIds;
	const visible = proposals.filter((option) => option.hide !== true);
	const ids = ballotIds ?? visible.map((option) => option.statementId);
	const { total, above } = scopeCounts(ids, proposals, gateOf(challenge, main));

	return {
		onlyAbove: onlyAboveGateOn(challenge),
		locked: Array.isArray(ballotIds),
		total,
		above,
		onChange: (onlyAbove: boolean) => {
			if (challenge) void setVoteDisplay(challenge.statementId, 'onlyAboveGate', onlyAbove);
		},
	};
}
