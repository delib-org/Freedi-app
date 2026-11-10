import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { tablesApi } from '@/lib/tableAssignment/client';
import { hostScreenPath } from '@/paths';

/** One computation at a time: the preview shows the one that "close and split" started. */
export const computeAction = new Action(
	'tables.host.computePreview',
	'tableAssignment.error.computeRefused',
);

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
	await computeAction.run(() => tablesApi.computePreview({ sessionId }), { sessionId });
	goTo(hostScreenPath(sessionId, 'preview'));
}
