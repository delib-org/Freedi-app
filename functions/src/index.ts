import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'firebase-functions/v1';
// The Firebase Admin SDK
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Import collection constants
import { Collections, functionConfig } from '@freedi/shared-types';

// Structured error handling
import { logError } from './utils/errorHandling';

// HTTP auth/authorization helpers (extracted for unit testing)
import { verifyAuthToken, requireSystemAdmin } from './utils/httpAuth';

// Import function modules
import { onChatStatementCreated } from './chat/fn_onChatStatementCreated';
import { onChatEvaluationCreated } from './chat/fn_onChatEvaluationCreated';
import { ssrChat } from './chat/ssrChat';
import { rescoreStatement } from './chat/fn_rescoreStatement';
import { redeemInvite, updateMembership } from './chat/fn_invite';
import {
	generateDialecticalRevision,
	acceptDialecticalRevision,
} from './chat/fn_dialecticalRevision';
import {
	deleteEvaluation,
	newEvaluation,
	updateEvaluation,
	updateChosenOptions,
} from './evaluation';
import { updateResultsSettings } from './fn_results';
import {
	getQuestionOptions,
	// updateNumberOfNewSubStatements,
} from './fn_statements';
import { updateVote } from './fn_vote';
import {
	onNewSubscription,
	onStatementDeletionDeleteSubscriptions,
	validateRoleChange,
	updateStatementMemberCount,
} from './fn_subscriptions';
import { updateParentOnChildUpdate, updateParentOnChildDelete } from './fn_statement_updates';
import {
	getRandomStatements,
	getTopStatements,
	getUserOptions,
	maintainRole,
	maintainDeliberativeElement,
	maintainStatement,
	maintainSubscriptionToken,
	updateAverageEvaluation,
	recalculateEvaluations,
	addRandomSeed,
	backfillEvaluationType,
	backfillParentsArray,
	backfillSubscriptionFields,
} from './fn_httpRequests';
import { findSimilarStatements } from './fn_findSimilarStatements';
import { detectMultipleSuggestions } from './fn_detectMultipleSuggestions';
import { mergeStatements } from './fn_mergeStatements';
import { updateApprovalResults } from './fn_approval';
import { setImportanceToStatement } from './fn_importance';
import { updateAgrees } from './fn_agree';
import { updateStatementWithViews } from './fn_views';
import {
	getInitialMCData,
	addMassConsensusMember,
	removeOptionFromMassConsensus,
	updateOptionInMassConsensus,
	addMemberToMassConsensus,
} from './fn_massConsensus';
import { addFeedback } from './fn_feedback';
import {
	addEmailSubscriber,
	sendEmailToSubscribers,
	getEmailSubscriberCount,
	unsubscribeEmail,
} from './fn_emailNotifications';
import { getCluster, recoverLastSnapshot } from './fn_clusters';
import { getBulkStatements, writeStatementDeletionTombstone } from './fn_bulkStatements';
import { checkProfanity } from './fn_profanityChecker';
import { recalculateStatementEvaluations } from './fn_recalculateEvaluations';
import { deleteResearchLogs } from './fn_deleteResearchLogs';
import { cleanupResearchLogs } from './fn_researchRetention';
import { scheduledStatementHistorySnapshot } from './statements/history/scheduledSnapshot';
import { cleanupStatementHistory } from './statements/history/historyRetention';
import { recalculateIndices } from './fn_recalculateIndices';
import { fixClusterIntegration } from './fn_fixClusterIntegration';
import { setMapFilter } from './fn_setMapFilter';
import { handleImproveSuggestion } from './fn_improveSuggestion';
import { onStatementCreated } from './fn_statementCreation';
import { analyzeSubscriptionPatterns } from './fn_metrics';

// Polarization Index Migration
import {
	recalculatePolarizationIndexForStatement,
	recalculatePolarizationIndexForParent,
	recalculatePolarizationIndexForGroup,
} from './migrations/recalculatePolarizationIndex';

// Token Cleanup Scheduled Function
import { cleanupStaleTokens, performTokenCleanup } from './fn_tokenCleanup';

// Admin Stats (KPI aggregation)
import { performUserStatsRefresh, backfillAdminStats } from './fn_adminStats';

// Engagement System (Phase 1-3: Credits, Levels, Badges, Streaks, Notification Queue, Digests)
import {
	calculateStreaks,
	performStreakCalculation,
} from './engagement/scheduled/streakCalculator';
import { seedDefaultCreditRules } from './engagement/credits/creditRules';
import { trackDailyLogin } from './engagement/credits/trackEngagement';
import {
	processQueueItem,
	processPendingQueueItems,
} from './engagement/notifications/queueProcessor';
import { sendDailyDigests, processDailyDigests } from './engagement/scheduled/dailyDigest';
import { sendWeeklyDigests, processWeeklyDigests } from './engagement/scheduled/weeklyDigest';
import type { NotificationQueueItem } from '@freedi/shared-types';

import { triggerTopicClusterPipeline } from './fn_topicClustering';
import { fn_syncParagraphChildrenToDescription } from './fn_syncParagraphChildrenToDescription';

// Strategic export (AI-ready report)
import { strategicExport } from './fn_strategicExport';

// Privacy-preserving user-data export (k-anonymized, server-side aggregation)
import { privacyExport } from './fn_privacyExport';

// Popper-Hebbian functions
import { analyzeFalsifiability } from './fn_popperHebbian_analyzeFalsifiability';
import { refineIdea } from './fn_popperHebbian_refineIdea';
import { onEvidencePostCreate, onEvidencePostUpdate } from './fn_popperHebbian_onEvidencePost';
import { onVoteUpdate } from './fn_popperHebbian_onVote';
import { summarizeLink } from './fn_popperHebbian_summarizeLink';
import { improveProposalWithAI } from './fn_popperHebbian_improveProposal';

// Room Assignment functions
import {
	createRoomAssignments,
	notifyRoomParticipants,
	getRoomAssignments,
	getMyRoomAssignment,
	deleteRoomAssignments,
} from './fn_roomAssignment';

// Split Joined Option functions
import {
	splitJoinedOption,
	getOptionsExceedingMax,
	getAllOptionsWithMembers,
	clearAllRoomsForParent,
	cleanupDuplicateRoomSettings,
} from './fn_splitJoinedOption';

// Statement Type Detection
import { detectStatementType } from './fn_detectStatementType';

// Discussion Summarization
import { summarizeDiscussion } from './fn_summarizeDiscussion';

// Integration of Similar Statements
import {
	findSimilarForIntegration,
	executeIntegration,
	reverseIntegrationCallable,
} from './fn_integrateSimilarStatements';

// Bulk Idea Synthesis (admin-triggered near-duplicate detection)
import {
	synthesizeIdeasPreview,
	synthesizeIdeasExecute,
	regenerateSynthesisProposal,
} from './fn_synthesizeIdeas';

// Google Docs Import
import { importGoogleDoc } from './fn_importGoogleDocs';

// Document Version AI Processing
import { processVersionAI } from './fn_versionAI';

// Suggestion Refinement AI (per-suggestion synthesis + improvement)
import { processRefinementAI } from './fn_refinementAI';

// Auto-Generate Version on Suggestion Threshold
import { onSuggestionCreatedAutoGenerate } from './fn_autoGenerateVersion';

// Paragraph Version Control (MVP)
import { fn_createReplacementQueueItem } from './fn_createReplacementQueueItem';
import { fn_updateQueueConsensus } from './fn_updateQueueConsensus';
import { fn_pruneVersionHistory } from './fn_pruneVersionHistory';
import { fn_notifyAdminReplacementPending } from './fn_notifyAdminReplacementPending';
import { fn_autoRemoveParagraph, fn_autoAddParagraph } from './fn_consensusActions';

// Civil Activity Hub — Join Form exports
import { fn_syncOptionMembersToSheet } from './engagement/joinForm/fn_syncOptionMembersToSheet';
import { fn_removeUserFromSheet } from './engagement/joinForm/fn_removeUserFromSheet';
import {
	fn_backupJoinFormSubmission,
	fn_backupOptionMembership,
} from './engagement/joinForm/fn_backupJoinRegistration';
import { fn_reconcileJoinSheet } from './engagement/joinForm/fn_reconcileJoinSheet';
import { fn_syncSubmissionToSheet } from './engagement/joinForm/fn_syncSubmissionToSheet';
import { fn_joinOption } from './engagement/joinForm/fn_joinOption';
import { getSheetServiceAccountEmail } from './engagement/joinForm/fn_getSheetServiceAccountEmail';
import { testSheetAccess } from './engagement/joinForm/fn_testSheetAccess';
import { createOrganizerSuggestion } from './engagement/joinForm/fn_createOrganizerSuggestion';
import { resolveJoinIntents } from './engagement/joinForm/fn_resolveJoinIntents';

// Civil Activity Hub — Join Delegate (per-question solution-editing delegation)
import { fn_createJoinDelegateInvite } from './engagement/joinDelegate/fn_createJoinDelegateInvite';
import { fn_acceptJoinDelegateInvite } from './engagement/joinDelegate/fn_acceptJoinDelegateInvite';
import { fn_revokeJoinDelegate } from './engagement/joinDelegate/fn_revokeJoinDelegate';
import { fn_onJoinDelegateInvitationCreated } from './engagement/joinDelegate/fn_onJoinDelegateInvitationCreated';

// Dynamic OG Tags for social media sharing
import { serveOgTags } from './fn_dynamicOgTags';
import {
	generateBulkEmbeddings,
	getEmbeddingStatus,
	regenerateEmbedding,
	deleteEmbedding,
} from './fn_embeddingOperations';

// Condensation / Grouped Suggestions
import {
	runCondensation,
	onEvaluationChangeRecomputeCondensationClusters,
	onStatementCreatedMarkCondensationStale,
} from './condensation/fn_runCondensation';
import { suggestClusterTitle } from './condensation/fn_suggestClusterTitle';
import { mergeClusters } from './condensation/fn_mergeClusters';

// Scheduled drift correction for evaluation aggregates
import { evaluationDriftCorrection } from './fn_evaluationDriftCorrection';

// Initialize Firebase only if not already initialized
if (!getApps().length) {
	initializeApp();
}
export const db = getFirestore();

// Environment configuration
// NODE_ENV is set by GCP at runtime; ENVIRONMENT comes from functions/.env (env-loader)
const isProduction =
	process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

/**
 * Gets current timestamp in HH:MM:SS.mmm format
 */
export const getTimestamp = (): string => {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	const ms = String(now.getMilliseconds()).padStart(3, '0');

	return `${hours}:${minutes}:${seconds}.${ms}`;
};

console.info(`[${getTimestamp()}] Environment:`, isProduction ? 'Production' : 'Development');

/**
 * CORS configuration based on environment
 */
const corsConfig = isProduction
	? [
			'https://freedi.tech',
			'https://delib.web.app',
			'https://freedi-test.web.app',
			'https://delib-5.web.app',
			'https://wizcol-app.web.app',
			'https://app.wizcol.com',
			'https://sign.wizcol.com',
		]
	: [
			'http://localhost:5173',
			'http://localhost:5174',
			'http://localhost:5175',
			'http://localhost:5176',
			'http://localhost:5177',
			'http://localhost:5178',
			'http://localhost:5179',
		];

/**
 * Creates a wrapper for HTTP functions with standardized error handling
 * @param {Function} handler - The function handler to wrap
 * @returns {Function} - Wrapped function with error handling
 */
const wrapHttpFunction = (handler: (req: Request, res: Response) => Promise<void>) => {
	return onRequest(
		{
			...functionConfig,
			cors: corsConfig,
		},
		async (req, res) => {
			const startTime = Date.now();
			const startTimestamp = getTimestamp();
			const functionName = handler.name || 'HTTP function';
			console.info(`[${startTimestamp}] ▶ Starting ${functionName}`);

			try {
				await handler(req, res);
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				console.info(`[${endTimestamp}] ✓ Completed ${functionName} in ${duration}ms`);
			} catch (error) {
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				logError(error, {
					operation: `httpFunction.${functionName}`,
					metadata: { duration, endTimestamp },
				});
				res.status(500).json({ ok: false, error: 'Internal Server Error' });
			}
		},
	);
};

/**
 * Creates a wrapper for memory-intensive HTTP functions (AI, embeddings, etc.)
 * Uses 1GB memory instead of default 256MB
 * @param {Function} handler - The function handler to wrap
 * @returns {Function} - Wrapped function with error handling and increased memory
 */
const wrapMemoryIntensiveHttpFunction = (
	handler: (req: Request, res: Response) => Promise<void>,
) => {
	return onRequest(
		{
			...functionConfig,
			cors: corsConfig,
			memory: '1GiB',
		},
		async (req, res) => {
			const startTime = Date.now();
			const startTimestamp = getTimestamp();
			const functionName = handler.name || 'HTTP function';
			console.info(`[${startTimestamp}] ▶ Starting ${functionName} (memory-intensive)`);

			try {
				await handler(req, res);
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				console.info(`[${endTimestamp}] ✓ Completed ${functionName} in ${duration}ms`);
			} catch (error) {
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				logError(error, {
					operation: `memoryIntensiveHttpFunction.${functionName}`,
					metadata: { duration, endTimestamp },
				});
				res.status(500).json({ ok: false, error: 'Internal Server Error' });
			}
		},
	);
};

/**
 * Creates a wrapper for admin/maintenance HTTP functions.
 * Requires a valid Firebase ID token in the Authorization header AND that the
 * authenticated user is a system admin (usersV2/{uid}.systemAdmin === true).
 * Authentication alone is NOT sufficient — these endpoints run database-wide
 * maintenance/migration jobs and must never be reachable by ordinary
 * (including anonymous) users.
 * @param {Function} handler - The function handler to wrap
 * @returns {Function} - Wrapped function with auth, authorization and error handling
 */
const wrapAdminHttpFunction = (
	handler: (req: Request, res: Response) => Promise<void>,
	overrides: {
		memory?: '256MiB' | '512MiB' | '1GiB' | '2GiB' | '4GiB' | '8GiB';
		timeoutSeconds?: number;
		secrets?: string[];
	} = {},
) => {
	return onRequest(
		{
			...functionConfig,
			cors: corsConfig,
			...overrides,
		},
		async (req, res) => {
			// Authentication is not enough — require system-admin authorization.
			const uid = await requireSystemAdmin(req, res);
			if (!uid) return;

			const startTime = Date.now();
			const startTimestamp = getTimestamp();
			const functionName = handler.name || 'Admin HTTP function';
			console.info(`[${startTimestamp}] ▶ Starting ${functionName} (admin, uid: ${uid})`);

			try {
				await handler(req, res);
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				console.info(`[${endTimestamp}] ✓ Completed ${functionName} in ${duration}ms`);
			} catch (error) {
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				logError(error, {
					operation: `adminHttpFunction.${functionName}`,
					metadata: { duration, endTimestamp, uid },
				});
				res.status(500).json({ ok: false, error: 'Internal Server Error' });
			}
		},
	);
};

/**
 * Creates a wrapper for Firestore triggers with standardized error handling.
 *
 * Note: Firebase trigger types (onDocumentCreated, onDocumentUpdated, onDocumentWritten,
 * onDocumentDeleted) have different event structures and incompatible generic parameters.
 * The callback's event type is preserved through the generic T, but we use a broad
 * function type for triggerType because the Firebase SDK types can't be unified.
 *
 * @param path - Document path pattern (e.g., '/statements/{statementId}')
 * @param triggerType - Firebase trigger function (onDocumentCreated, etc.)
 * @param callback - Handler function that receives the typed event
 * @param functionName - Name for logging purposes
 * @returns Configured Firebase Cloud Function
 */
function createFirestoreFunction<T>(
	path: string,
	triggerType:
		| typeof onDocumentCreated
		| typeof onDocumentUpdated
		| typeof onDocumentWritten
		| typeof onDocumentDeleted,
	callback: (event: T) => Promise<unknown>,
	functionName: string,
): ReturnType<typeof onDocumentCreated> {
	// Cast to unknown first, then to a compatible function signature
	// This is required because Firebase's trigger types have incompatible generic structures
	const trigger = triggerType as unknown as (
		opts: { document: string } & typeof functionConfig,
		handler: (event: T) => Promise<void>,
	) => ReturnType<typeof onDocumentCreated>;

	return trigger(
		{
			document: path,
			...functionConfig,
		},
		async (event: T) => {
			const startTime = Date.now();
			const startTimestamp = getTimestamp();
			console.info(`[${startTimestamp}] ▶ Starting ${functionName}`);

			try {
				await callback(event);
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				console.info(`[${endTimestamp}] ✓ Completed ${functionName} in ${duration}ms`);
			} catch (error) {
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				logError(error, {
					operation: `firestoreTrigger.${functionName}`,
					metadata: { duration, endTimestamp, path },
				});
				throw error;
			}
		},
	);
}

// --------------------------
// HTTP FUNCTIONS
// --------------------------
exports.getRandomStatements = wrapHttpFunction(getRandomStatements);
exports.getTopStatements = wrapHttpFunction(getTopStatements);
exports.getUserOptions = wrapHttpFunction(getUserOptions);
exports.findSimilarStatements = wrapMemoryIntensiveHttpFunction(findSimilarStatements);
exports.massConsensusGetInitialData = wrapHttpFunction(getInitialMCData);
exports.getQuestionOptions = wrapHttpFunction(getQuestionOptions);
exports.massConsensusAddMember = wrapHttpFunction(addMassConsensusMember);
exports.addFeedback = wrapHttpFunction(addFeedback);

// Email notification functions
exports.addEmailSubscriber = wrapHttpFunction(addEmailSubscriber);
exports.sendEmailToSubscribers = wrapHttpFunction(sendEmailToSubscribers);
exports.getEmailSubscriberCount = wrapHttpFunction(getEmailSubscriberCount);
exports.unsubscribeEmail = wrapHttpFunction(unsubscribeEmail);
exports.getCluster = wrapHttpFunction(getCluster);
exports.recoverLastSnapshot = wrapHttpFunction(recoverLastSnapshot);
// Bulk fetch for "Load all" (mind-map / agreement-map / collaboration-index).
// Authenticated via Firebase ID token inside the handler (verifyAuthToken).
exports.getBulkStatements = wrapHttpFunction(getBulkStatements);
exports.checkProfanity = checkProfanity;
exports.recalculateStatementEvaluations = recalculateStatementEvaluations;
exports.deleteResearchLogs = deleteResearchLogs;
exports.cleanupResearchLogs = cleanupResearchLogs;
exports.scheduledStatementHistorySnapshot = scheduledStatementHistorySnapshot;
exports.cleanupStatementHistory = cleanupStatementHistory;
exports.recalculateIndices = recalculateIndices;
exports.fixClusterIntegration = fixClusterIntegration;
exports.setMapFilter = setMapFilter;
exports.improveSuggestion = wrapMemoryIntensiveHttpFunction(handleImproveSuggestion);
exports.detectMultipleSuggestions = wrapMemoryIntensiveHttpFunction(detectMultipleSuggestions);
exports.mergeStatements = wrapMemoryIntensiveHttpFunction(mergeStatements);
exports.detectStatementType = wrapMemoryIntensiveHttpFunction(detectStatementType);

// PHASE 4 FIX: Metrics and monitoring functions
exports.analyzeSubscriptionPatterns = analyzeSubscriptionPatterns;

// Maintenance HTTP functions (admin auth required)
exports.maintainRole = wrapAdminHttpFunction(maintainRole);
exports.maintainDeliberativeElement = wrapAdminHttpFunction(maintainDeliberativeElement);
exports.maintainStatement = wrapAdminHttpFunction(maintainStatement);
exports.maintainSubscriptionToken = wrapAdminHttpFunction(maintainSubscriptionToken);
exports.updateAverageEvaluation = wrapAdminHttpFunction(updateAverageEvaluation);
exports.recalculateEvaluations = wrapAdminHttpFunction(recalculateEvaluations);
exports.addRandomSeed = wrapAdminHttpFunction(addRandomSeed);
exports.backfillEvaluationType = wrapAdminHttpFunction(backfillEvaluationType);
exports.backfillParentsArray = wrapAdminHttpFunction(backfillParentsArray);
exports.backfillSubscriptionFields = wrapAdminHttpFunction(backfillSubscriptionFields);

// --------------------------
// FIRESTORE TRIGGER FUNCTIONS
// --------------------------

// Statement functions
// exports.updateNumberOfNewSubStatements = createFirestoreFunction(
// 	`/${Collections.statements}/{statementId}`,
// 	onDocumentCreated,
// 	updateNumberOfNewSubStatements,
// 	'updateNumberOfNewSubStatements'
// );

// ============================================
// CONSOLIDATED STATEMENT CREATION FUNCTION
// ============================================
// This single function replaces multiple individual functions to reduce triggers
exports.onStatementCreated = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentCreated,
	onStatementCreated,
	'onStatementCreated',
);

// ============================================
// Dialectical Chat app (apps/chat)
// ============================================
exports.onChatStatementCreated = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentCreated,
	onChatStatementCreated,
	'onChatStatementCreated',
);
// onDocumentWritten (not -Created): re-votes (update) and retractions (delete)
// must recompute the option's denormalized C / average / evaluator count too.
exports.onChatEvaluationCreated = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentWritten,
	onChatEvaluationCreated,
	'onChatEvaluationCreated',
);
exports.ssrChat = ssrChat;
exports.rescoreStatement = rescoreStatement;
exports.redeemInvite = redeemInvite;
exports.updateMembership = updateMembership;
exports.generateDialecticalRevision = generateDialecticalRevision;
exports.acceptDialecticalRevision = acceptDialecticalRevision;

// ============================================
// DEPRECATED: Individual statement creation functions
// Commented out in favor of consolidated onStatementCreated
// ============================================
// exports.updateInAppNotifications = createFirestoreFunction(
//   `/${Collections.statements}/{statementId}`,
//   onDocumentCreated,
//   updateInAppNotifications,
//   "updateInAppNotifications"
// );

// exports.setAdminsToNewStatement = createFirestoreFunction(
//   `/${Collections.statements}/{statementId}`,
//   onDocumentCreated,
//   setAdminsToNewStatement,
//   "setAdminsToNewStatement"
// );

// exports.updateChosenOptionsOnOptionCreate = createFirestoreFunction(
//   `/${Collections.statements}/{statementId}`,
//   onDocumentCreated,
//   updateChosenOptions,
//   "updateChosenOptionsOnOptionCreate"
// );

// exports.addOptionToMassConsensus = createFirestoreFunction(
//   `/${Collections.statements}/{statementId}`,
//   onDocumentCreated,
//   addOptionToMassConsensus,
//   "addOptionToMassConsensus"
// );

// exports.updateParentOnChildCreate - Now handled in onStatementCreated

// ============================================
// ACTIVE FUNCTIONS
// ============================================
exports.updateStatementWithViews = createFirestoreFunction(
	`/${Collections.statementViews}/{viewId}`,
	onDocumentCreated,
	updateStatementWithViews,
	'updateStatementWithViews',
);

exports.onStatementDeletion = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentDeleted,
	onStatementDeletionDeleteSubscriptions,
	`onStatementDeletionDeleteSubscriptions`,
);

// Tombstone for delta listeners: clients that bulk-loaded a scope only see
// docs whose lastUpdate changed, so hard deletes must be broadcast separately.
exports.onStatementDeletionTombstone = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentDeleted,
	writeStatementDeletionTombstone,
	'writeStatementDeletionTombstone',
);

// Subscription functions
// PHASE 2 FIX: Renamed for clarity - handles waiting role subscriptions and admin notifications
exports.handleWaitingRoleSubscriptions = createFirestoreFunction(
	`/${Collections.statementsSubscribe}/{subscriptionId}`,
	onDocumentWritten,
	onNewSubscription,
	'handleWaitingRoleSubscriptions',
);

// Validate role changes to prevent banning admins or creators
exports.validateRoleChange = createFirestoreFunction(
	`/${Collections.statementsSubscribe}/{subscriptionId}`,
	onDocumentUpdated,
	validateRoleChange,
	'validateRoleChange',
);

// Update statement's numberOfMembers count when subscriptions are created/deleted
exports.updateStatementMemberCount = createFirestoreFunction(
	`/${Collections.statementsSubscribe}/{subscriptionId}`,
	onDocumentWritten,
	updateStatementMemberCount,
	'updateStatementMemberCount',
);

// New v2 functions to update statements and subscriptions efficiently
// These are v2 functions, so we export them directly without the wrapper
// Note: updateParentOnChildCreate is now handled in onStatementCreated
// exports.updateParentOnChildCreate = updateParentOnChildCreate;
exports.updateParentOnChildUpdate = updateParentOnChildUpdate;
exports.updateParentOnChildDelete = updateParentOnChildDelete;
// REMOVED: updateSubscriptionsSimpleStatement — replaced by Snapshot + Overlay pattern

// DEPRECATED: This function is no longer needed
// exports.updateParentStatementOnChildChange = updateParentStatementOnChildChange;

// Mass Consensus functions (for updates and deletes only)
// Create is now handled in onStatementCreated
exports.removeOptionFromMassConsensus = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentDeleted,
	removeOptionFromMassConsensus,
	'removeOptionFromMassConsensus',
);
exports.updateOptionInMassConsensus = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentUpdated,
	updateOptionInMassConsensus,
	'updateOptionInMassConsensus',
);

exports.addMemberToMassConsensus = createFirestoreFunction(
	`/${Collections.massConsensusMembers}/{memberId}`,
	onDocumentCreated,
	addMemberToMassConsensus,
	'addMemberToMassConsensus',
);

// Evaluation functions
exports.onSetChoseBySettings = createFirestoreFunction(
	`/${Collections.choseBy}/{statementId}`,
	onDocumentWritten,
	updateChosenOptions,
	'onSetChoseBySettings',
);

exports.newEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentCreated,
	newEvaluation,
	'newEvaluation',
);

exports.deleteEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentDeleted,
	deleteEvaluation,
	'deleteEvaluation',
);

exports.updateEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentUpdated,
	updateEvaluation,
	'updateEvaluation',
);

// Results functions
exports.updateResultsSettings = createFirestoreFunction(
	`/${Collections.resultsTriggers}/{statementId}`,
	onDocumentWritten,
	updateResultsSettings,
	'updateResultsSettings',
);

// This handles evaluation-based chosen option updates (different from statement creation)
exports.onSetChoseBySettings = createFirestoreFunction(
	`/${Collections.choseBy}/{statementId}`,
	onDocumentWritten,
	updateChosenOptions,
	'onSetChoseBySettings',
);

// Voting and approval functions
exports.addVote = createFirestoreFunction(
	'/votes/{voteId}',
	onDocumentWritten,
	updateVote,
	'addVote',
);

exports.updateDocumentApproval = createFirestoreFunction(
	`/${Collections.approval}/{approvalId}`,
	onDocumentWritten,
	updateApprovalResults,
	'updateDocumentApproval',
);

exports.setImportanceToStatement = createFirestoreFunction(
	`/${Collections.importance}/{importanceId}`,
	onDocumentWritten,
	setImportanceToStatement,
	'setImportanceToStatement',
);

exports.updateAgrees = createFirestoreFunction(
	`/${Collections.agrees}/{agreeId}`,
	onDocumentWritten,
	updateAgrees,
	'updateAgrees',
);

// Popper-Hebbian functions
exports.analyzeFalsifiability = analyzeFalsifiability;
exports.refineIdea = refineIdea;
exports.onEvidencePostCreate = onEvidencePostCreate;
exports.onEvidencePostUpdate = onEvidencePostUpdate;
exports.onVoteUpdate = onVoteUpdate;
exports.summarizeLink = summarizeLink;
exports.improveProposalWithAI = improveProposalWithAI;

// Room Assignment functions
exports.createRoomAssignments = wrapHttpFunction(createRoomAssignments);
exports.notifyRoomParticipants = wrapHttpFunction(notifyRoomParticipants);
exports.getRoomAssignments = wrapHttpFunction(getRoomAssignments);
exports.getMyRoomAssignment = wrapHttpFunction(getMyRoomAssignment);
exports.deleteRoomAssignments = wrapHttpFunction(deleteRoomAssignments);

// Split Joined Option functions
exports.splitJoinedOption = wrapHttpFunction(splitJoinedOption);
exports.getOptionsExceedingMax = wrapHttpFunction(getOptionsExceedingMax);
exports.getAllOptionsWithMembers = wrapHttpFunction(getAllOptionsWithMembers);
exports.clearAllRoomsForParent = wrapHttpFunction(clearAllRoomsForParent);
exports.cleanupDuplicateRoomSettings = wrapHttpFunction(cleanupDuplicateRoomSettings);

// Discussion Summarization
exports.summarizeDiscussion = summarizeDiscussion;

// Dynamic OG Tags for social media sharing
exports.serveOgTags = serveOgTags;

// Google Docs Import
exports.importGoogleDoc = wrapHttpFunction(importGoogleDoc);

// Document Version AI Processing (for Sign app - uses 540s timeout vs Vercel's 30s limit)
exports.processVersionAI = wrapMemoryIntensiveHttpFunction(processVersionAI);

// Suggestion Refinement AI (per-suggestion synthesis + improvement from comments)
exports.processRefinementAI = wrapMemoryIntensiveHttpFunction(processRefinementAI);

// Auto-Generate Version on Suggestion Threshold
exports.onSuggestionCreatedAutoGenerate = createFirestoreFunction(
	`/${Collections.suggestions}/{suggestionId}`,
	onDocumentCreated,
	onSuggestionCreatedAutoGenerate,
	'onSuggestionCreatedAutoGenerate',
);

// Integration of Similar Statements
exports.findSimilarForIntegration = findSimilarForIntegration;
exports.executeIntegration = executeIntegration;
exports.reverseIntegration = reverseIntegrationCallable;

// Bulk Idea Synthesis
exports.synthesizeIdeasPreview = synthesizeIdeasPreview;
exports.synthesizeIdeasExecute = synthesizeIdeasExecute;
exports.regenerateSynthesisProposal = regenerateSynthesisProposal;

// Embedding Operations (for vector-based similarity search)
exports.generateBulkEmbeddings = wrapHttpFunction(generateBulkEmbeddings);
exports.getEmbeddingStatus = wrapHttpFunction(getEmbeddingStatus);
exports.regenerateEmbedding = wrapHttpFunction(regenerateEmbedding);
exports.deleteEmbedding = wrapHttpFunction(deleteEmbedding);

// Polarization Index Migration (for recalculating with demographic data)
exports.recalculatePolarizationIndexForStatement = wrapHttpFunction(
	async (req: Request, res: Response) => {
		const { statementId } = req.body;
		if (!statementId) {
			res.status(400).json({ error: 'statementId is required' });

			return;
		}
		const result = await recalculatePolarizationIndexForStatement(statementId);
		res.json(result);
	},
);

exports.recalculatePolarizationIndexForParent = wrapHttpFunction(
	async (req: Request, res: Response) => {
		const { parentId } = req.body;
		if (!parentId) {
			res.status(400).json({ error: 'parentId is required' });

			return;
		}
		const result = await recalculatePolarizationIndexForParent(parentId);
		res.json(result);
	},
);

exports.recalculatePolarizationIndexForGroup = wrapHttpFunction(
	async (req: Request, res: Response) => {
		const { topParentId } = req.body;
		if (!topParentId) {
			res.status(400).json({ error: 'topParentId is required' });

			return;
		}
		const result = await recalculatePolarizationIndexForGroup(topParentId);
		res.json(result);
	},
);

// Paragraph Version Control (MVP) - Sign app
exports.fn_createReplacementQueueItem = fn_createReplacementQueueItem;
exports.fn_updateQueueConsensus = fn_updateQueueConsensus;
exports.fn_pruneVersionHistory = fn_pruneVersionHistory;
exports.fn_notifyAdminReplacementPending = fn_notifyAdminReplacementPending;
exports.fn_autoRemoveParagraph = fn_autoRemoveParagraph;
exports.fn_autoAddParagraph = fn_autoAddParagraph;
exports.fn_syncParagraphChildrenToDescription = fn_syncParagraphChildrenToDescription;
exports.fn_syncOptionMembersToSheet = fn_syncOptionMembersToSheet;
exports.fn_removeUserFromSheet = fn_removeUserFromSheet;
exports.fn_backupJoinFormSubmission = fn_backupJoinFormSubmission;
exports.fn_backupOptionMembership = fn_backupOptionMembership;
exports.fn_reconcileJoinSheet = fn_reconcileJoinSheet;
exports.fn_syncSubmissionToSheet = fn_syncSubmissionToSheet;
exports.fn_joinOption = fn_joinOption;
exports.getSheetServiceAccountEmail = getSheetServiceAccountEmail;
exports.testSheetAccess = testSheetAccess;
exports.createOrganizerSuggestion = createOrganizerSuggestion;
exports.resolveJoinIntents = resolveJoinIntents;
exports.fn_createJoinDelegateInvite = fn_createJoinDelegateInvite;
exports.fn_acceptJoinDelegateInvite = fn_acceptJoinDelegateInvite;
exports.fn_revokeJoinDelegate = fn_revokeJoinDelegate;
exports.fn_onJoinDelegateInvitationCreated = fn_onJoinDelegateInvitationCreated;

// --------------------------
// SCHEDULED FUNCTIONS
// --------------------------

// Scheduled function to clean up stale FCM tokens (runs daily at 3:00 AM UTC)
exports.cleanupStaleTokens = cleanupStaleTokens;

// HTTP endpoint for manual token cleanup (admin auth required)
exports.manualTokenCleanup = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const result = await performTokenCleanup();
	res.json(result);
});

// --------------------------
// ENGAGEMENT SYSTEM (Phase 1)
// --------------------------

// Scheduled function to update streaks daily at 00:05 UTC
exports.calculateStreaks = calculateStreaks;

// HTTP endpoint for manual streak calculation (admin auth required)
exports.manualStreakCalculation = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const result = await performStreakCalculation();
	res.json(result);
});

// HTTP endpoint to seed default credit rules into Firestore (admin auth required)
exports.seedCreditRules = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const seeded = await seedDefaultCreditRules();
	res.json({ seeded, message: `Seeded ${seeded} new credit rules` });
});

// HTTP endpoint for tracking daily login (called by client on app open).
// This is a per-user endpoint, NOT an admin one: it only requires a valid
// Firebase ID token and always tracks the *authenticated* user (the token uid),
// never a userId supplied in the request body.
exports.trackDailyLogin = wrapHttpFunction(async (req: Request, res: Response) => {
	const uid = await verifyAuthToken(req, res);
	if (!uid) return;

	const { sourceApp } = req.body ?? {};
	await trackDailyLogin(uid, sourceApp || 'main');
	res.json({ success: true });
});

// Notification Queue Processor - Firestore trigger on new queue items (Phase 2)
exports.onNotificationQueued = createFirestoreFunction(
	`/${Collections.notificationQueue}/{queueItemId}`,
	onDocumentCreated,
	async (event: Parameters<Parameters<typeof onDocumentCreated>[1]>[0]) => {
		if (!event.data) return;
		const item = event.data.data() as NotificationQueueItem;
		const queueItemId = event.params.queueItemId;
		await processQueueItem(queueItemId, item);
	},
	'onNotificationQueued',
);

// HTTP endpoint to manually process pending notification queue items (admin auth required)
exports.processNotificationQueue = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const result = await processPendingQueueItems();
	res.json(result);
});

// ENGAGEMENT SYSTEM (Phase 3 - Digests)
// --------------------------------------

// Scheduled function: daily digest (every hour, checks per-user timezone)
exports.sendDailyDigests = sendDailyDigests;

// Scheduled function: weekly digest (daily at 10:00 UTC, checks per-user day preference)
exports.sendWeeklyDigests = sendWeeklyDigests;

// HTTP endpoint for manual daily digest processing (admin auth required)
exports.manualDailyDigest = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const hour = req.body?.hour ?? new Date().getUTCHours();
	const result = await processDailyDigests(hour);
	res.json(result);
});

// HTTP endpoint for manual weekly digest processing (admin auth required)
exports.manualWeeklyDigest = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const result = await processWeeklyDigests();
	res.json(result);
});

// --------------------------
// ADMIN STATS (KPI Aggregation)
// --------------------------

// Scheduled function: refresh user count daily at 00:10 UTC
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const refreshUserStats = onSchedule(
	{
		schedule: '10 0 * * *',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 300,
	},
	async () => {
		await performUserStatsRefresh();
	},
);

// Ship 2 — async-synthesis job model.
// `synthesisJobStart` and `synthesisJobCancel` are callables that gate on
// the SYNTHESIS_ASYNC_JOB_MODE flag. The Firestore-write dispatcher routes
// jobs through their phases. The heartbeat sweep recovers stuck jobs every
// 5 min. The existing synchronous `synthesizeIdeasPreview` is unchanged —
// clients pick which entry point to call.
export { synthesisJobStart, synthesisJobCancel } from './synthesis/asyncJob/fn_synthesisJobStart';
export { fn_synthesisHeartbeatSweep } from './synthesis/asyncJob/fn_synthesisHeartbeatSweep';
export { fn_synthesisBulkFlush } from './synthesis/scheduled/fn_synthesisBulkFlush';
export { fn_synthesisReJudge } from './synthesis/scheduled/fn_synthesisReJudge';

import { dispatchSynthesisJobWrite } from './synthesis/asyncJob/fn_synthesisJobDispatch';

exports.synthesisJobDispatch = createFirestoreFunction(
	'/synthesisJobs/{jobId}',
	onDocumentWritten,
	dispatchSynthesisJobWrite,
	'synthesisJobDispatch',
);

// Ship 3a — cluster-aware polarization scheduled flusher.
// Runs every 1 minute, drains `_clusterRecomputeQueue`, recomputes synth
// cluster aggregates + polarization indexes. No-ops when the
// SYNTHESIS_CLUSTER_AWARE_POLARIZATION flag is OFF (drains queue without
// acting). See plans/synthesis-100k-living-synth.md, Ship 3 §"Trigger 3" /
// "Debounced flusher".
export { fn_clusterRecomputeFlush } from './synthesis/liveSynth/fn_clusterRecomputeFlush';

// Ship 3b — live-synth attach/spawn/dissolve triggers.
// Both are gated by the SYNTHESIS_LIVE_SYNTH_ENABLED flag and exit
// immediately at handler entry when OFF. The handlers themselves live in
// `synthesis/liveSynth/onOptionCreateLive.ts` and `onOptionUpdateLive.ts`.
// See plans/synthesis-100k-living-synth.md, Ship 3 §"Trigger 1" / "Trigger 2".
import { liveSynthOnOptionCreate } from './synthesis/liveSynth/onOptionCreateLive';
import { liveSynthOnOptionUpdate } from './synthesis/liveSynth/onOptionUpdateLive';

exports.liveSynthOnOptionCreate = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentCreated,
	async (event: { data?: { data: () => unknown } }) => {
		if (!event.data) return;
		await liveSynthOnOptionCreate(event.data.data());
	},
	'liveSynthOnOptionCreate',
);

exports.liveSynthOnOptionUpdate = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentUpdated,
	async (event: { data?: { before: { data: () => unknown }; after: { data: () => unknown } } }) => {
		if (!event.data) return;
		await liveSynthOnOptionUpdate(event.data.before.data(), event.data.after.data());
	},
	'liveSynthOnOptionUpdate',
);

// Living-only synthesis (Day 1–5). All entry points flow into `runSinglePipeline`.
import { liveSynthOnOptionEvaluationChange } from './synthesis/liveSynth/onOptionEvaluationChange';

exports.liveSynthOnOptionEvaluationChange = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentUpdated,
	async (event: { data?: { before: { data: () => unknown }; after: { data: () => unknown } } }) => {
		if (!event.data) return;
		await liveSynthOnOptionEvaluationChange(event.data.before.data(), event.data.after.data());
	},
	'liveSynthOnOptionEvaluationChange',
);

export { processSynthesisQueue } from './synthesis/queue/processSynthesisQueue';
export { synthesizeNow } from './synthesis/admin/fn_synthesizeNow';
export { reCluster } from './synthesis/admin/fn_reCluster';
export { globalCluster } from './synthesis/admin/fn_globalCluster';
export { reEmbedQuestion } from './synthesis/admin/fn_reEmbedQuestion';
export { synthesizeSelected } from './synthesis/admin/fn_synthesizeSelected';
export { rejudgeGrayBand } from './synthesis/admin/fn_rejudgeGrayBand';
export { saveSynthesisSettings } from './synthesis/admin/fn_saveSynthesisSettings';
export {
	synthesisPause,
	synthesisResume,
	synthesisCancel,
} from './synthesis/admin/fn_synthesisControl';

// HTTP endpoint for one-time historical backfill (admin auth required)
exports.backfillAdminStats = wrapAdminHttpFunction(backfillAdminStats);

// HTTP endpoint for manual user stats refresh (admin auth required)
exports.manualRefreshUserStats = wrapAdminHttpFunction(async (req: Request, res: Response) => {
	const result = await performUserStatsRefresh();
	res.json(result);
});

// HTTP endpoint for the new topic-cluster pipeline (admin-triggered, on-demand).
// Replaces the scheduled sweep above. See functions/src/services/topic-cluster/.
// Pipeline loads many statements + 1536-d embeddings + UMAP/DBSCAN + Anthropic SDK
// in one request — needs more memory than the 256 MiB default and a longer timeout.
exports.triggerTopicClusterPipeline = wrapAdminHttpFunction(triggerTopicClusterPipeline, {
	memory: '1GiB',
	timeoutSeconds: 540,
});

// AI-ready strategic-report export. May trigger the topic-cluster pipeline as a
// dependency, plus runs an LLM topic-grouping pass — needs the same memory/
// timeout profile as triggerTopicClusterPipeline.
exports.strategicExport = wrapAdminHttpFunction(strategicExport, {
	memory: '1GiB',
	timeoutSeconds: 540,
});

// Privacy-preserving user-data export. Reads all options + every user's raw
// evaluations and demographic answers, aggregates with k-anonymity suppression
// server-side, and returns only the anonymized result. Large deliberations mean
// heavier reads/aggregation, so it gets a raised memory/timeout profile.
exports.privacyExport = wrapAdminHttpFunction(privacyExport, {
	memory: '1GiB',
	timeoutSeconds: 540,
});

// Condensation / Grouped Suggestions — non-destructive clustering on demand,
// evaluation aggregation writeback, and stale-marking trigger.
exports.runCondensation = runCondensation;
exports.onEvaluationChangeRecomputeCondensationClusters =
	onEvaluationChangeRecomputeCondensationClusters;
exports.onStatementCreatedMarkCondensationStale = onStatementCreatedMarkCondensationStale;
exports.suggestClusterTitle = suggestClusterTitle;
exports.mergeClusters = mergeClusters;
exports.evaluationDriftCorrection = evaluationDriftCorrection;

// Per-survey backup pipeline (scheduled + manual)
export { backupSurveyOnRequest } from './backups/backupSurveyOnRequest';
export { scheduledDailyBackups } from './backups/scheduledDailyBackups';
export { backupSurveyCallable } from './backups/backupSurveyCallable';

// Agora classroom deliberative game — session lifecycle
export {
	agoraCreateSession,
	agoraJoinSession,
	agoraAdvanceStage,
	agoraGradeValueIdentification,
	agoraWritingAssistant,
	agoraSetRound,
	agoraResolveSuggestion,
	agoraCharacterReview,
	agoraEstimateReception,
	agoraGenerateTopicPackage,
	agoraSessionSweep,
	onAgoraEvaluationWritten,
} from './agora';
