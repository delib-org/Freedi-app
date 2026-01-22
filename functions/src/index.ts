import {
  onDocumentUpdated,
  onDocumentCreated,
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { Request, Response } from "firebase-functions/v1";
// The Firebase Admin SDK
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Import collection constants
import { Collections, functionConfig } from "delib-npm";

// Import function modules
import {
  deleteEvaluation,
  newEvaluation,
  updateEvaluation,
  updateChosenOptions,
} from "./fn_evaluation";
import { updateResultsSettings } from "./fn_results";
import {
  getQuestionOptions,
  // updateNumberOfNewSubStatements,
} from "./fn_statements";
import { updateVote } from "./fn_vote";
import {
  onNewSubscription,
  onStatementDeletionDeleteSubscriptions,
  updateSubscriptionsSimpleStatement,
  validateRoleChange,
  updateStatementMemberCount
} from "./fn_subscriptions";
import {
  updateParentOnChildUpdate,
  updateParentOnChildDelete
} from "./fn_statement_updates";
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
  addRandomSeed
} from "./fn_httpRequests";
import { findSimilarStatements } from "./fn_findSimilarStatements";
import { detectMultipleSuggestions } from "./fn_detectMultipleSuggestions";
import { mergeStatements } from "./fn_mergeStatements";
import { updateApprovalResults } from "./fn_approval";
import { setImportanceToStatement } from "./fn_importance";
import { updateAgrees } from "./fn_agree";
import { updateStatementWithViews } from "./fn_views";
import {
  getInitialMCData,
  addMassConsensusMember,
  removeOptionFromMassConsensus,
  updateOptionInMassConsensus,
  addMemberToMassConsensus,
} from "./fn_massConsensus";
import { addFeedback } from "./fn_feedback";
import {
  addEmailSubscriber,
  sendEmailToSubscribers,
  getEmailSubscriberCount,
  unsubscribeEmail,
} from "./fn_emailNotifications";
import { getCluster, recoverLastSnapshot } from "./fn_clusters";
import {
  generateMultipleFramings,
  requestCustomFraming,
  getFramingsForStatement,
  getFramingClusters,
  deleteFraming,
} from "./fn_multiFramingClusters";
import {
  getClusterAggregations,
  recalculateClusterAggregation,
  getFramingAggregationSummary,
  onEvaluationChangeInvalidateCache,
} from "./fn_clusterAggregation";
import { checkProfanity } from "./fn_profanityChecker";
import { recalculateStatementEvaluations } from "./fn_recalculateEvaluations";
import { fixClusterIntegration } from "./fn_fixClusterIntegration";
import { handleImproveSuggestion } from "./fn_improveSuggestion";
import { onStatementCreated } from "./fn_statementCreation";
import { analyzeSubscriptionPatterns } from "./fn_metrics";

// Polarization Index Migration
import {
  recalculatePolarizationIndexForStatement,
  recalculatePolarizationIndexForParent,
  recalculatePolarizationIndexForGroup,
} from "./migrations/recalculatePolarizationIndex";

// Fair Evaluation functions
import {
  initializeWallet,
  onFairEvalEvaluationChange,
  addMinutesToGroup,
  setAnswerCost,
  acceptFairEvalAnswer,
  completeToGoal,
  getWalletInfo,
  getTransactionHistory,
} from "./fn_fairEvaluation";
// Token Cleanup Scheduled Function
import { cleanupStaleTokens, performTokenCleanup } from "./fn_tokenCleanup";

// Popper-Hebbian functions
import { analyzeFalsifiability } from "./fn_popperHebbian_analyzeFalsifiability";
import { refineIdea } from "./fn_popperHebbian_refineIdea";
import { onEvidencePostCreate, onEvidencePostUpdate } from "./fn_popperHebbian_onEvidencePost";
import { onVoteUpdate } from "./fn_popperHebbian_onVote";
import { summarizeLink } from "./fn_popperHebbian_summarizeLink";
import { improveProposalWithAI } from "./fn_popperHebbian_improveProposal";

// Room Assignment functions
import {
  createRoomAssignments,
  notifyRoomParticipants,
  getRoomAssignments,
  getMyRoomAssignment,
  deleteRoomAssignments,
} from "./fn_roomAssignment";

// Split Joined Option functions
import {
  splitJoinedOption,
  getOptionsExceedingMax,
  getAllOptionsWithMembers,
  clearAllRoomsForParent,
  cleanupDuplicateRoomSettings,
} from "./fn_splitJoinedOption";

// Discussion Summarization
import { summarizeDiscussion } from "./fn_summarizeDiscussion";

// Integration of Similar Statements
import { findSimilarForIntegration, executeIntegration } from "./fn_integrateSimilarStatements";

// Google Docs Import
import { importGoogleDoc } from "./fn_importGoogleDocs";

// Dynamic OG Tags for social media sharing
import { serveOgTags } from "./fn_dynamicOgTags";
import {
  generateBulkEmbeddings,
  getEmbeddingStatus,
  regenerateEmbedding,
  deleteEmbedding,
  testEmbeddingGeneration,
} from "./fn_embeddingOperations";

// Initialize Firebase only if not already initialized
if (!getApps().length) {
  initializeApp();
}
export const db = getFirestore();

// Environment configuration
const isProduction = process.env.NODE_ENV === "production";

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

console.info(`[${getTimestamp()}] Environment:`, isProduction ? "Production" : "Development");

/**
 * CORS configuration based on environment
 */
const corsConfig = isProduction
  ? [
      "https://freedi.tech",
      "https://delib.web.app",
      "https://freedi-test.web.app",
      "https://delib-5.web.app",
      "https://wizcol-app.web.app",
      "https://app.wizcol.com",
    ]
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:5177",
      "http://localhost:5178",
      "http://localhost:5179",
    ];

/**
 * Creates a wrapper for HTTP functions with standardized error handling
 * @param {Function} handler - The function handler to wrap
 * @returns {Function} - Wrapped function with error handling
 */
const wrapHttpFunction = (
  handler: (req: Request, res: Response) => Promise<void>
) => {
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
        console.error(`[${endTimestamp}] ✗ Error in ${functionName} after ${duration}ms:`, error);
        res.status(500).send("Internal Server Error");
      }
    }
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
  triggerType: typeof onDocumentCreated | typeof onDocumentUpdated | typeof onDocumentWritten | typeof onDocumentDeleted,
  callback: (event: T) => Promise<unknown>,
  functionName: string
): ReturnType<typeof onDocumentCreated> {
  // Cast to unknown first, then to a compatible function signature
  // This is required because Firebase's trigger types have incompatible generic structures
  const trigger = triggerType as unknown as (
    opts: { document: string } & typeof functionConfig,
    handler: (event: T) => Promise<void>
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
        console.error(`[${endTimestamp}] ✗ Error in ${functionName} after ${duration}ms:`, error);
        throw error;
      }
    }
  );
}

// --------------------------
// HTTP FUNCTIONS
// --------------------------
exports.getRandomStatements = wrapHttpFunction(getRandomStatements);
exports.getTopStatements = wrapHttpFunction(getTopStatements);
exports.getUserOptions = wrapHttpFunction(getUserOptions);
exports.findSimilarStatements = wrapHttpFunction(findSimilarStatements);
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
exports.checkProfanity = checkProfanity;
exports.recalculateStatementEvaluations = recalculateStatementEvaluations;
exports.fixClusterIntegration = fixClusterIntegration;
exports.improveSuggestion = wrapHttpFunction(handleImproveSuggestion);
exports.detectMultipleSuggestions = wrapHttpFunction(detectMultipleSuggestions);
exports.mergeStatements = wrapHttpFunction(mergeStatements);

// PHASE 4 FIX: Metrics and monitoring functions
exports.analyzeSubscriptionPatterns = analyzeSubscriptionPatterns;

// Maintenance HTTP functions
exports.maintainRole = wrapHttpFunction(maintainRole);
exports.maintainDeliberativeElement = wrapHttpFunction(maintainDeliberativeElement);
exports.maintainStatement = wrapHttpFunction(maintainStatement);
exports.maintainSubscriptionToken = wrapHttpFunction(maintainSubscriptionToken);
exports.updateAverageEvaluation = wrapHttpFunction(updateAverageEvaluation);
exports.recalculateEvaluations = wrapHttpFunction(recalculateEvaluations);
exports.addRandomSeed = wrapHttpFunction(addRandomSeed);

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
  "onStatementCreated"
);

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
  "updateStatementWithViews"
);

exports.onStatementDeletion = createFirestoreFunction(
  `/${Collections.statements}/{statementId}`,
  onDocumentDeleted,
  onStatementDeletionDeleteSubscriptions,
  `onStatementDeletionDeleteSubscriptions`
);

// Subscription functions
// PHASE 2 FIX: Renamed for clarity - handles waiting role subscriptions and admin notifications
exports.handleWaitingRoleSubscriptions = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentWritten,
  onNewSubscription,
  "handleWaitingRoleSubscriptions"
);

// Validate role changes to prevent banning admins or creators
exports.validateRoleChange = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentUpdated,
  validateRoleChange,
  "validateRoleChange"
);

// Update statement's numberOfMembers count when subscriptions are created/deleted
exports.updateStatementMemberCount = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentWritten,
  updateStatementMemberCount,
  "updateStatementMemberCount"
);

// New v2 functions to update statements and subscriptions efficiently
// These are v2 functions, so we export them directly without the wrapper
// Note: updateParentOnChildCreate is now handled in onStatementCreated
// exports.updateParentOnChildCreate = updateParentOnChildCreate;
exports.updateParentOnChildUpdate = updateParentOnChildUpdate;
exports.updateParentOnChildDelete = updateParentOnChildDelete;
exports.updateSubscriptionsSimpleStatement = updateSubscriptionsSimpleStatement;

// DEPRECATED: This function is no longer needed
// exports.updateParentStatementOnChildChange = updateParentStatementOnChildChange;

// Mass Consensus functions (for updates and deletes only)
// Create is now handled in onStatementCreated
exports.removeOptionFromMassConsensus = createFirestoreFunction(
  `/${Collections.statements}/{statementId}`,
  onDocumentDeleted,
  removeOptionFromMassConsensus,
  "removeOptionFromMassConsensus"
);
exports.updateOptionInMassConsensus = createFirestoreFunction(
  `/${Collections.statements}/{statementId}`,
  onDocumentUpdated,
  updateOptionInMassConsensus,
  "updateOptionInMassConsensus"
);

exports.addMemberToMassConsensus = createFirestoreFunction(
  `/${Collections.massConsensusMembers}/{memberId}`,
  onDocumentCreated,
  addMemberToMassConsensus,
  "addMemberToMassConsensus"
);

// Evaluation functions
exports.onSetChoseBySettings = createFirestoreFunction(
  `/${Collections.choseBy}/{statementId}`,
  onDocumentWritten,
  updateChosenOptions,
  "onSetChoseBySettings"
);

exports.newEvaluation = createFirestoreFunction(
  `/${Collections.evaluations}/{evaluationId}`,
  onDocumentCreated,
  newEvaluation,
  "newEvaluation"
);

exports.deleteEvaluation = createFirestoreFunction(
  `/${Collections.evaluations}/{evaluationId}`,
  onDocumentDeleted,
  deleteEvaluation,
  "deleteEvaluation"
);

exports.updateEvaluation = createFirestoreFunction(
  `/${Collections.evaluations}/{evaluationId}`,
  onDocumentUpdated,
  updateEvaluation,
  "updateEvaluation"
);

// Results functions
exports.updateResultsSettings = createFirestoreFunction(
  `/${Collections.resultsTriggers}/{statementId}`,
  onDocumentWritten,
  updateResultsSettings,
  "updateResultsSettings"
);

// This handles evaluation-based chosen option updates (different from statement creation)
exports.onSetChoseBySettings = createFirestoreFunction(
  `/${Collections.choseBy}/{statementId}`,
  onDocumentWritten,
  updateChosenOptions,
  "onSetChoseBySettings"
);

// Voting and approval functions
exports.addVote = createFirestoreFunction(
  "/votes/{voteId}",
  onDocumentWritten,
  updateVote,
  "addVote"
);

exports.updateDocumentApproval = createFirestoreFunction(
  `/${Collections.approval}/{approvalId}`,
  onDocumentWritten,
  updateApprovalResults,
  "updateDocumentApproval"
);

exports.setImportanceToStatement = createFirestoreFunction(
  `/${Collections.importance}/{importanceId}`,
  onDocumentWritten,
  setImportanceToStatement,
  "setImportanceToStatement"
);

exports.updateAgrees = createFirestoreFunction(
  `/${Collections.agrees}/{agreeId}`,
  onDocumentWritten,
  updateAgrees,
  "updateAgrees"
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

// Integration of Similar Statements
exports.findSimilarForIntegration = findSimilarForIntegration;
exports.executeIntegration = executeIntegration;

// Multi-Framing Clustering
exports.generateMultipleFramings = wrapHttpFunction(generateMultipleFramings);
exports.requestCustomFraming = wrapHttpFunction(requestCustomFraming);
exports.getFramingsForStatement = wrapHttpFunction(getFramingsForStatement);
exports.getFramingClusters = wrapHttpFunction(getFramingClusters);
exports.deleteFraming = wrapHttpFunction(deleteFraming);

// Cluster Aggregation
exports.getClusterAggregations = wrapHttpFunction(getClusterAggregations);
exports.recalculateClusterAggregation = wrapHttpFunction(recalculateClusterAggregation);
exports.getFramingAggregationSummary = wrapHttpFunction(getFramingAggregationSummary);
exports.onEvaluationChangeInvalidateCache = onEvaluationChangeInvalidateCache;

// Embedding Operations (for vector-based similarity search)
exports.generateBulkEmbeddings = wrapHttpFunction(generateBulkEmbeddings);
exports.getEmbeddingStatus = wrapHttpFunction(getEmbeddingStatus);
exports.regenerateEmbedding = wrapHttpFunction(regenerateEmbedding);
exports.deleteEmbedding = wrapHttpFunction(deleteEmbedding);
exports.testEmbeddingGeneration = wrapHttpFunction(testEmbeddingGeneration);

// Polarization Index Migration (for recalculating with demographic data)
exports.recalculatePolarizationIndexForStatement = wrapHttpFunction(
  async (req: Request, res: Response) => {
    const { statementId } = req.body;
    if (!statementId) {
      res.status(400).json({ error: "statementId is required" });
      
return;
    }
    const result = await recalculatePolarizationIndexForStatement(statementId);
    res.json(result);
  }
);

exports.recalculatePolarizationIndexForParent = wrapHttpFunction(
  async (req: Request, res: Response) => {
    const { parentId } = req.body;
    if (!parentId) {
      res.status(400).json({ error: "parentId is required" });
      
return;
    }
    const result = await recalculatePolarizationIndexForParent(parentId);
    res.json(result);
  }
);

exports.recalculatePolarizationIndexForGroup = wrapHttpFunction(
  async (req: Request, res: Response) => {
    const { topParentId } = req.body;
    if (!topParentId) {
      res.status(400).json({ error: "topParentId is required" });
      
return;
    }
    const result = await recalculatePolarizationIndexForGroup(topParentId);
    res.json(result);
  }
);

// Fair Evaluation Functions
// Trigger: Initialize wallet when user joins a group with fair eval enabled
exports.initializeFairEvalWallet = createFirestoreFunction(
  `/${Collections.statementsSubscribe}/{subscriptionId}`,
  onDocumentCreated,
  initializeWallet,
  "initializeFairEvalWallet"
);

// Trigger: Recalculate answer metrics when evaluation changes
exports.onFairEvalEvaluationChange = createFirestoreFunction(
  `/${Collections.evaluations}/{evaluationId}`,
  onDocumentWritten,
  onFairEvalEvaluationChange,
  "onFairEvalEvaluationChange"
);

// HTTP: Add minutes to all members in a group (admin only)
exports.addMinutesToGroup = wrapHttpFunction(addMinutesToGroup);

/// Callable: Set/update answer cost (admin only)
exports.setAnswerCost = setAnswerCost;

// HTTP: Accept an answer and deduct payments (admin only)
exports.acceptFairEvalAnswer = wrapHttpFunction(acceptFairEvalAnswer);

// HTTP: Add minutes to reach goal then accept (admin only)
exports.completeToGoal = wrapHttpFunction(completeToGoal);

// HTTP: Get wallet info for a user
exports.getWalletInfo = wrapHttpFunction(getWalletInfo);

// HTTP: Get transaction history for a user
exports.getTransactionHistory = wrapHttpFunction(getTransactionHistory);
// --------------------------
// SCHEDULED FUNCTIONS
// --------------------------

// Scheduled function to clean up stale FCM tokens (runs daily at 3:00 AM UTC)
exports.cleanupStaleTokens = cleanupStaleTokens;

// HTTP endpoint for manual token cleanup
exports.manualTokenCleanup = wrapHttpFunction(
  async (req: Request, res: Response) => {
    const result = await performTokenCleanup();
    res.json(result);
  }
);
