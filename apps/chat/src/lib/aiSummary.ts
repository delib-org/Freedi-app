/**
 * Client helpers for the AI thread-summary callables. Kept out of components so
 * the fetch/accept state can live in MessageNode (button shows the wait; the
 * summary box only mounts once loaded — one smooth open, no two-step jump).
 */
import { functionsClient } from './firebaseClient';

export interface SummaryResult {
	summary: string;
	improvementSuggestion: string;
	descendantCount: number;
	cached?: boolean;
}

async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
	const [fns, { httpsCallable }] = await Promise.all([
		functionsClient(),
		import('firebase/functions'),
	]);

	return (await httpsCallable<TReq, TRes>(fns, name)(data)).data;
}

export function generateSummary(statementId: string): Promise<SummaryResult> {
	return callFn<{ statementId: string }, SummaryResult>('generateDialecticalRevision', {
		statementId,
	});
}

export function acceptRevision(statementId: string): Promise<{ accepted: boolean }> {
	return callFn<{ statementId: string }, { accepted: boolean }>('acceptDialecticalRevision', {
		statementId,
	});
}
