import type { Change, DocumentSnapshot, FirestoreEvent } from 'firebase-functions/v2/firestore';
import { queueDeliberation } from '../deliberation/functions';
import { fn_syncOptionMembersToSheet } from '../engagement/joinForm/fn_syncOptionMembersToSheet';
import { fn_backupOptionMembership } from '../engagement/joinForm/fn_backupJoinRegistration';
import { onStatementCreatedMarkCondensationStale } from '../condensation/fn_runCondensation';
import { fn_syncParagraphChildrenToDescription } from '../fn_syncParagraphChildrenToDescription';
import { fn_pruneVersionHistory } from '../fn_pruneVersionHistory';
import { fn_autoAddParagraph, fn_autoRemoveParagraph } from '../fn_consensusActions';
import { fn_createReplacementQueueItem } from '../fn_createReplacementQueueItem';
import { fn_updateQueueConsensus } from '../fn_updateQueueConsensus';
import { updateOptionInMassConsensus } from '../fn_massConsensus';
import { mirrorQuestionStatusToSurvey } from '../organizations/studio/mirrorQuestionStatusToSurvey';
import { onVoteUpdate } from '../fn_popperHebbian_onVote';
import { STATEMENT_GATES, StatementChange, StatementGate } from './routeGates';

export type StatementWriteEvent = FirestoreEvent<
	Change<DocumentSnapshot> | undefined,
	{ statementId: string }
>;

/** `update` matches the old onDocumentUpdated triggers, `write` the onDocumentWritten ones. */
type RouteEvent = 'update' | 'write';

export interface StatementRoute {
	name: keyof typeof STATEMENT_GATES;
	event: RouteEvent;
	gate: StatementGate;
	invoke: (event: StatementWriteEvent) => Promise<unknown>;
}

/** Each handler reads the document id under the parameter name its old trigger declared. */
function withParamName(event: StatementWriteEvent, paramName: string): StatementWriteEvent {
	return { ...event, params: { [paramName]: event.params.statementId } } as StatementWriteEvent;
}

function route<E>(
	name: StatementRoute['name'],
	event: RouteEvent,
	paramName: string,
	handler: { run: (event: E) => unknown },
): StatementRoute {
	return {
		name,
		event,
		gate: STATEMENT_GATES[name],
		// The handlers' event types differ only in document nullability and
		// parameter name; withParamName supplies the name at runtime.
		invoke: async (statementEvent) =>
			handler.run(withParamName(statementEvent, paramName) as unknown as E),
	};
}

/**
 * Handlers that share one trigger. A handler belongs here only when it exits on
 * a field check, calls no AI model, and does not do real work on most writes.
 * Left out on purpose: liveSynthOnOptionUpdate, liveSynthOnOptionEvaluationChange,
 * onAgoraProposalWritten and onEvidencePostUpdate (AI calls), and
 * updateParentOnChildUpdate (real work on most writes, and no field check to gate on).
 */
export const STATEMENT_ROUTES: readonly StatementRoute[] = [
	route('queueDeliberation', 'write', 'id', queueDeliberation),
	route('fn_syncOptionMembersToSheet', 'write', 'statementId', fn_syncOptionMembersToSheet),
	route('fn_backupOptionMembership', 'write', 'statementId', fn_backupOptionMembership),
	route(
		'onStatementCreatedMarkCondensationStale',
		'write',
		'statementId',
		onStatementCreatedMarkCondensationStale,
	),
	route(
		'fn_syncParagraphChildrenToDescription',
		'write',
		'statementId',
		fn_syncParagraphChildrenToDescription,
	),
	route('fn_pruneVersionHistory', 'update', 'paragraphId', fn_pruneVersionHistory),
	route('fn_autoRemoveParagraph', 'update', 'paragraphId', fn_autoRemoveParagraph),
	route('fn_autoAddParagraph', 'update', 'suggestionId', fn_autoAddParagraph),
	route('fn_createReplacementQueueItem', 'update', 'suggestionId', fn_createReplacementQueueItem),
	route('fn_updateQueueConsensus', 'update', 'suggestionId', fn_updateQueueConsensus),
	route('updateOptionInMassConsensus', 'update', 'statementId', {
		run: updateOptionInMassConsensus,
	}),
	route('mirrorQuestionStatusToSurvey', 'update', 'statementId', mirrorQuestionStatusToSurvey),
	route('onVoteUpdate', 'update', 'statementId', onVoteUpdate),
];

export function routeMatches(statementRoute: StatementRoute, change: StatementChange): boolean {
	if (statementRoute.event === 'update' && change.kind !== 'update') return false;

	return statementRoute.gate(change);
}
