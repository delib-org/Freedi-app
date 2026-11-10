import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { TRIGGER_MAX_INSTANCES } from '../config/triggerLimits';
import { HOT_TRIGGER_MEMORY } from '../utils/createFirestoreFunction';
import { logError } from '../utils/errorHandling';
import { dispatcherOwnsEvent, STATEMENT_DISPATCH_CUTOVER_MS } from './cutover';
import { StatementChange } from './routeGates';
import { routeMatches, STATEMENT_ROUTES, StatementRoute, StatementWriteEvent } from './routes';

function toStatementChange(event: StatementWriteEvent): StatementChange | null {
	const before = event.data?.before.exists ? (event.data.before.data() as Statement) : undefined;
	const after = event.data?.after.exists ? (event.data.after.data() as Statement) : undefined;

	if (before && after) return { kind: 'update', before, after };
	if (after) return { kind: 'create', after };
	if (before) return { kind: 'delete', before };

	return null;
}

/**
 * A gate that throws is logged and counts as a match, so one malformed document
 * can only widen what runs. Every handler still applies its own checks.
 */
function routeMatchesSafely(
	statementRoute: StatementRoute,
	change: StatementChange,
	statementId: string,
): boolean {
	try {
		return routeMatches(statementRoute, change);
	} catch (error) {
		logError(error, {
			operation: `statementDispatch.gate.${statementRoute.name}`,
			statementId,
			metadata: { kind: change.kind },
		});

		return true;
	}
}

/**
 * Runs the handlers whose gate matches, all at once, as separate triggers did.
 * A failing handler is logged and cannot stop the others. Nothing is rethrown:
 * none of these triggers had retries, so a throw only ever reached the logs.
 */
export async function dispatchStatementWrite(
	event: StatementWriteEvent,
	routes: readonly StatementRoute[] = STATEMENT_ROUTES,
	cutoverMs: number = STATEMENT_DISPATCH_CUTOVER_MS,
): Promise<void> {
	if (!dispatcherOwnsEvent(event, cutoverMs)) return;

	const change = toStatementChange(event);
	if (!change) return;

	const { statementId } = event.params;
	const matched = routes.filter((statementRoute) =>
		routeMatchesSafely(statementRoute, change, statementId),
	);
	const results = await Promise.allSettled(
		matched.map((statementRoute) => statementRoute.invoke(event)),
	);

	results.forEach((result, index) => {
		if (result.status === 'rejected') {
			logError(result.reason, {
				operation: `statementDispatch.${matched[index].name}`,
				statementId,
				metadata: { kind: change.kind },
			});
		}
	});
}

export const onStatementWriteDispatch = onDocumentWritten(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
		// The longest limit any moved handler had, so none gets less time.
		timeoutSeconds: functionConfig.timeoutSeconds,
		memory: HOT_TRIGGER_MEMORY,
		maxInstances: TRIGGER_MAX_INSTANCES.statementWrite,
	},
	(event) => dispatchStatementWrite(event),
);
