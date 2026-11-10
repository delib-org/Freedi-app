import type { Action } from '@/lib/action';
import { safeStorage } from '@/lib/safeStorage';
import { tablesApi } from '@/lib/tableAssignment/client';
import { clearDraft } from '@/logic/localDraft';
import type { ChoicesDraft } from '@/logic/localDraft';
import { savedPosition } from '@/logic/positionStops';

/**
 * The last step's one save: choices and position together, replacing both on
 * the server. Resolves true when saved; on failure the draft stays for a retry.
 */
export async function saveChoices(
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
	clearDraft(sessionId, uid, safeStorage);

	return true;
}
