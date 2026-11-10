import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { Collections, functionConfig } from '@freedi/shared-types';
import type { MemoryOption } from 'firebase-functions/v2';
import { queueDeliberation } from '../deliberation/functions';
import { fn_syncOptionMembersToSheet } from '../engagement/joinForm/fn_syncOptionMembersToSheet';
import { fn_backupOptionMembership } from '../engagement/joinForm/fn_backupJoinRegistration';
import { onStatementCreatedMarkCondensationStale } from '../condensation/fn_runCondensation';
import { fn_syncParagraphChildrenToDescription } from '../fn_syncParagraphChildrenToDescription';
import { fn_pruneVersionHistory } from '../fn_pruneVersionHistory';
import { fn_autoAddParagraph, fn_autoRemoveParagraph } from '../fn_consensusActions';
import { fn_createReplacementQueueItem } from '../fn_createReplacementQueueItem';
import { fn_updateQueueConsensus } from '../fn_updateQueueConsensus';
import { mirrorQuestionStatusToSurvey } from '../organizations/studio/mirrorQuestionStatusToSurvey';
import { onVoteUpdate } from '../fn_popperHebbian_onVote';
import { CommitTimedEvent, skipWhenDispatcherOwns } from './cutover';

/**
 * The old statement triggers, with their deployed names and options unchanged,
 * except that each leaves a write alone once the dispatcher owns it. They exist
 * only for the cutover. Once the cutover time has passed in production, remove
 * this file and its exports from index.ts, and run `firebase functions:delete`
 * for these names and updateOptionInMassConsensus.
 */
interface OldTrigger {
	run: (event: never) => unknown;
}

function guarded(trigger: OldTrigger) {
	return skipWhenDispatcherOwns(trigger.run as (event: CommitTimedEvent) => unknown);
}

function options(paramName: string, memory?: MemoryOption) {
	return {
		document: `${Collections.statements}/{${paramName}}`,
		region: functionConfig.region,
		...(memory ? { memory } : {}),
	};
}

function updated(paramName: string, trigger: OldTrigger) {
	return onDocumentUpdated(options(paramName), guarded(trigger));
}

function written(paramName: string, trigger: OldTrigger, memory?: MemoryOption) {
	return onDocumentWritten(options(paramName, memory), guarded(trigger));
}

export const legacyStatementTriggers = {
	queueDeliberation: written('id', queueDeliberation),
	fn_syncOptionMembersToSheet: written('statementId', fn_syncOptionMembersToSheet),
	fn_backupOptionMembership: written('statementId', fn_backupOptionMembership),
	onStatementCreatedMarkCondensationStale: written(
		'statementId',
		onStatementCreatedMarkCondensationStale,
	),
	fn_syncParagraphChildrenToDescription: written(
		'statementId',
		fn_syncParagraphChildrenToDescription,
		'256MiB',
	),
	fn_pruneVersionHistory: updated('paragraphId', fn_pruneVersionHistory),
	fn_autoRemoveParagraph: updated('paragraphId', fn_autoRemoveParagraph),
	fn_autoAddParagraph: updated('suggestionId', fn_autoAddParagraph),
	fn_createReplacementQueueItem: updated('suggestionId', fn_createReplacementQueueItem),
	fn_updateQueueConsensus: updated('suggestionId', fn_updateQueueConsensus),
	mirrorQuestionStatusToSurvey: updated('statementId', mirrorQuestionStatusToSurvey),
	onVoteUpdate: updated('statementId', onVoteUpdate),
};
