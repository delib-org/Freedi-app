/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'firebase-functions/v1';

// The Firebase Admin SDK
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Import collection constants
import { Collections, functionConfig } from 'delib-npm';

// Import function modules
import {
	deleteEvaluation,
	newEvaluation,
	updateChosenOptions,
	updateEvaluation,
} from './fn_evaluation';
import { updateResultsSettings } from './fn_results';
import {
	getQuestionOptions,
	updateParentWithNewMessageCB,
} from './fn_statements';
import { updateVote } from './fn_vote';
import { setAdminsToNewStatement } from './fn_roles';
import { updateStatementNumberOfMembers } from './fn_subscriptions';
import {
	getRandomStatements,
	getTopStatements,
	getUserOptions,
} from './fn_httpRequests';
import { findSimilarStatements } from './fn_findSimilarStatements';
import { updateApprovalResults } from './fn_approval';
import { setImportanceToStatement } from './fn_importance';
import { updateAgrees } from './fn_agree';
import { setUserSettings } from './fn_users';
import { updateStatementWithViews } from './fn_views';
import { getInitialMCData } from './fn_massConsensus';

// Initialize Firebase
initializeApp();
export const db = getFirestore();

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production';
console.info('Environment:', isProduction ? 'Production' : 'Development');

/**
 * CORS configuration based on environment
 */
const corsConfig = isProduction
	? ['https://freedi.tech', 'https://delib.web.app']
	: [
		'https://freedi-test.web.app',
		'https://delib-5.web.app',
		'https://freedi.tech',
		'https://delib.web.app',
		'http://localhost:5173',
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
				console.error('Error in HTTP function:', error);
				res.status(500).send('Internal Server Error');
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
const createFirestoreFunction = (path: string, triggerType: any, callback: Function, functionName: string) => {
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

// --------------------------
// FIRESTORE TRIGGER FUNCTIONS
// --------------------------

// User functions
exports.setUserSettings = createFirestoreFunction(
	`/${Collections.users}/{userId}`,
	onDocumentCreated,
	setUserSettings,
	'setUserSettings'
);

// Statement functions
exports.updateParentWithNewMessage = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentCreated,
	updateParentWithNewMessageCB,
	'updateParentWithNewMessage'
);

exports.setAdminsToNewStatement = createFirestoreFunction(
	`/${Collections.statements}/{statementId}`,
	onDocumentCreated,
	setAdminsToNewStatement,
	'setAdminsToNewStatement'
);

exports.updateStatementWithViews = createFirestoreFunction(
	`/${Collections.statementViews}/{viewId}`,
	onDocumentCreated,
	updateStatementWithViews,
	'updateStatementWithViews'
);

// Subscription functions
exports.updateMembers = createFirestoreFunction(
	`/${Collections.statementsSubscribe}/{subscriptionId}`,
	onDocumentWritten,
	updateStatementNumberOfMembers,
	'updateMembers'
);

// Evaluation functions
exports.onSetChoseBySettings = createFirestoreFunction(
	`/${Collections.choseBy}/{statementId}`,
	onDocumentWritten,
	updateChosenOptions,
	'onSetChoseBySettings'
);

exports.newEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentCreated,
	newEvaluation,
	'newEvaluation'
);

exports.deleteEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentDeleted,
	deleteEvaluation,
	'deleteEvaluation'
);

exports.updateEvaluation = createFirestoreFunction(
	`/${Collections.evaluations}/{evaluationId}`,
	onDocumentUpdated,
	updateEvaluation,
	'updateEvaluation'
);

// Results functions
exports.updateResultsSettings = createFirestoreFunction(
	`/${Collections.resultsTriggers}/{statementId}`,
	onDocumentWritten,
	updateResultsSettings,
	'updateResultsSettings'
);

// Voting and approval functions
exports.addVote = createFirestoreFunction(
	'/votes/{voteId}',
	onDocumentWritten,
	updateVote,
	'addVote'
);

exports.updateDocumentApproval = createFirestoreFunction(
	`/${Collections.approval}/{approvalId}`,
	onDocumentWritten,
	updateApprovalResults,
	'updateDocumentApproval'
);

exports.setImportanceToStatement = createFirestoreFunction(
	`/${Collections.importance}/{importanceId}`,
	onDocumentWritten,
	setImportanceToStatement,
	'setImportanceToStatement'
);

exports.updateAgrees = createFirestoreFunction(
	`/${Collections.agrees}/{agreeId}`,
	onDocumentWritten,
	updateAgrees,
	'updateAgrees'
);