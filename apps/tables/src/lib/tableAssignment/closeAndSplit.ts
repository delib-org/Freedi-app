import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { tablesApi } from '@/lib/tableAssignment/client';
import { hostScreenPath } from '@/paths';

const computeActions = new Map<string, Action>();

/**
 * One computation at a time per assignment: the preview shows the one that "close and split"
 * started, and another assignment's busy state or error never shows up on this one.
 */
export function computeActionFor(sessionId: string): Action {
	let action = computeActions.get(sessionId);

	if (!action) {
		action = new Action('tables.host.computePreview', 'tableAssignment.error.computeRefused');
		computeActions.set(sessionId, action);
	}

	return action;
}

/**
 * Close registration, compute, open the preview. When computing fails the
 * registration stays closed and the preview offers it again with the reason.
 */
export async function closeAndSplit(sessionId: string, closeAction: Action): Promise<void> {
	const closed = await closeAction.run(
		() => tablesApi.setStatus({ sessionId, status: 'registrationClosed' }),
		{ sessionId },
	);

	if (!closed) return;
	await computeActionFor(sessionId).run(() => tablesApi.computePreview({ sessionId }), {
		sessionId,
	});
	goTo(hostScreenPath(sessionId, 'preview'));
}
