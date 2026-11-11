import type { Unsubscribe } from 'firebase/firestore';
import { logError } from '@/utils/errorHandling';
import { bulkLoadStatements } from './bulkLoadStatements';

/**
 * A host below the level governing a tree cannot name that level in a live
 * query, and rules cannot tell which subtree a `parents` query asks for. The
 * bulk endpoint can: it checks access on the server. Not live; a one-time load.
 */
export function loadTreeForHost(rootId: string): () => Unsubscribe {
	return () => {
		bulkLoadStatements(rootId, 'descendants').catch((error: unknown) => {
			logError(error, { operation: 'statements.loadTreeForHost', statementId: rootId });
		});

		return () => undefined;
	};
}
