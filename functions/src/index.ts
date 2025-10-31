/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
  updateAverageEvaluation
} from "./fn_httpRequests";
import { findSimilarStatements } from "./fn_findSimilarStatements";
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
import { getCluster, recoverLastSnapshot } from "./fn_clusters";
import { checkProfanity } from "./fn_profanityChecker";
import { handleImproveSuggestion } from "./fn_improveSuggestion";
import { onStatementCreated } from "./fn_statementCreation";
import { analyzeSubscriptionPatterns } from "./fn_metrics";

// Popper-Hebbian functions
import { analyzeFalsifiability } from "./fn_popperHebbian_analyzeFalsifiability";
import { refineIdea } from "./fn_popperHebbian_refineIdea";
import { onEvidencePostCreate, onEvidencePostUpdate } from "./fn_popperHebbian_onEvidencePost";
import { onVoteUpdate } from "./fn_popperHebbian_onVote";
import { summarizeLink } from "./fn_popperHebbian_summarizeLink";

// Initialize Firebase only if not already initialized
if (!getApps().length) {
  initializeApp();
}
export const db = getFirestore();

// Environment configuration
const isProduction = process.env.NODE_ENV === "production";
console.info("Environment:", isProduction ? "Production" : "Development");

/**
 * CORS configuration based on environment
 */
const corsConfig = isProduction
  ? [
      "https://freedi.tech",
      "https://delib.web.app",
      "https://freedi-test.web.app",
      "https://delib-5.web.app",
      "https://delib.web.app",
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
      try {
        await handler(req, res);
      } catch (error) {
        console.error("Error in HTTP function:", error);
        res.status(500).send("Internal Server Error");
      }
    }
  );
};

/**
 * Creates a wrapper for Firestore triggers with standardized error handling
 * @param {string} path - Document path
 * @param {Function} triggerType - Firebase trigger type (onDocumentCreated, etc.)
 * @param {Function} callback - Function to execute
 * @param {string} functionName - Function name for logging
 * @returns {Function} - Firebase function with error handling
 */

//@ts-ignore
const createFirestoreFunction = (
  path: string,
  triggerType: any,
  callback: Function,
  functionName: string
) => {
  return triggerType(
    {
      document: path,
      ...functionConfig,
    },
    async (event: any) => {
      try {
        await callback(event);
      } catch (error) {
        console.error(`Error in ${functionName}:`, error);
        throw error;
      }
    }
  );
};

// --------------------------
// HTTP FUNCTIONS
// --------------------------
exports.getRandomStatements = wrapHttpFunction(getRandomStatements);
exports.getTopStatements = wrapHttpFunction(getTopStatements);
exports.getUserOptions = wrapHttpFunction(getUserOptions);
exports.checkForSimilarStatements = wrapHttpFunction(findSimilarStatements);
exports.massConsensusGetInitialData = wrapHttpFunction(getInitialMCData);
exports.getQuestionOptions = wrapHttpFunction(getQuestionOptions);
exports.massConsensusAddMember = wrapHttpFunction(addMassConsensusMember);
exports.addFeedback = wrapHttpFunction(addFeedback);
exports.getCluster = wrapHttpFunction(getCluster);
exports.recoverLastSnapshot = wrapHttpFunction(recoverLastSnapshot);
exports.checkProfanity = checkProfanity;
exports.improveSuggestion = wrapHttpFunction(handleImproveSuggestion);

// PHASE 4 FIX: Metrics and monitoring functions
exports.analyzeSubscriptionPatterns = analyzeSubscriptionPatterns;

// Maintenance HTTP functions
exports.maintainRole = wrapHttpFunction(maintainRole);
exports.maintainDeliberativeElement = wrapHttpFunction(maintainDeliberativeElement);
exports.maintainStatement = wrapHttpFunction(maintainStatement);
exports.maintainSubscriptionToken = wrapHttpFunction(maintainSubscriptionToken);
exports.updateAverageEvaluation = wrapHttpFunction(updateAverageEvaluation);

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
