import type { Action } from '@/lib/action';
import { safeStorage } from '@/lib/safeStorage';
import { tablesApi } from '@/lib/tableAssignment/client';
import { goTo } from '@/lib/navigate';
import { clearDraft } from '@/logic/localDraft';
import type { ChoicesDraft } from '@/logic/localDraft';
import { savedPosition } from '@/logic/positionStops';
import { participantHomePath } from '@/paths';

/**
 * The last step's one save: choices and position together, replacing both on
 * the server, then back to the home. Resolves true when saved; on failure the
 * draft stays for a retry. The person leaves first and the draft goes after:
 * the other way round, the screen can redraw without its draft in between and
 * send them back to Rank.
 */
export async function saveChoicesAndLeave(
	action: Action,
	context: { sessionId: string; uid: string },
	draft: ChoicesDraft,
): Promise<boolean> {
	const { sessionId, uid } = context;
	const position = savedPosition(draft.position);
	const result = await action.run(
		() =>
			tablesApi.savePreferences({
				sessionId,
				preferences: draft.ranked,
				...(position === undefined ? {} : { position }),
			}),
		{ sessionId, count: draft.ranked.length },
	);

	if (!result) return false;
	goTo(participantHomePath(sessionId));
	clearDraft(sessionId, uid, safeStorage);

	return true;
}
