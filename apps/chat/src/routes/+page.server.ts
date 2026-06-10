/**
 * `/` Discovery (public, no auth). SSR list of latest public roots. No per-card
 * listeners. Resilient: if Firestore is unreachable, render an empty list so the
 * shell still serves crawlable HTML.
 */
import type { PageServerLoad } from './$types';
import { loadDiscovery } from '$lib/server/conversation';
import type { Statement } from '@freedi/shared-types';

export const load: PageServerLoad = async () => {
	let roots: Statement[] = [];
	try {
		roots = await loadDiscovery(30);
	} catch (e) {
		console.error('[chat] discovery load failed:', e instanceof Error ? e.message : e);
	}

	return {
		roots: roots.map((r) => ({
			statementId: r.statementId,
			statement: r.statement,
			creatorName: r.creator?.displayName ?? 'Anonymous',
			optionCount: r.optionCount ?? 0,
			leadingOptionId: r.leadingOptionId ?? null,
			convergenceIndex: r.convergenceIndex ?? 0,
			lastActivityAt: r.lastActivityAt ?? r.lastUpdate ?? r.createdAt ?? 0,
		})),
	};
};
