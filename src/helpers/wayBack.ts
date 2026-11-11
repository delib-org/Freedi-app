import { toSafeRedirectPath } from './initialRoute';

const STATEMENT_PATH = /^\/(?:statement|statement-screen)\/([^/?#]+)/;

/** The statement page a person came from, unless it is the one that just turned them away. */
export function getWayBackPath(from: unknown, blockedPath: string | undefined): string | undefined {
	const safePath = toSafeRedirectPath(from);
	const fromStatementId = safePath?.match(STATEMENT_PATH)?.[1];
	if (!fromStatementId) return undefined;

	return fromStatementId === blockedPath?.match(STATEMENT_PATH)?.[1] ? undefined : safePath;
}
