import {
	deleteEvaluation,
	newEvaluation,
	updateChosenOptions,
	updateEvaluation,
} from './fn_evaluation';
import { updateResultsSettings } from './fn_results';
import { updateDocumentSignatures } from './fn_signatures';
import { updateParentWithNewMessageCB } from './fn_statements';
import { updateVote } from './fn_vote';

import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';

import { onSchedule } from 'firebase-functions/v2/scheduler';

// The Firebase Admin SDK to access Firestore.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { cleanOldTimers } from './fn_timers';
import { setAdminsToNewStatement } from './fn_roles';
import { updateStatementNumberOfMembers } from './fn_subscriptions';
import {
	checkPassword,
	getRandomStatements,
	getTopStatements,
	getUserOptions,
	hashPassword,
} from './fn_httpRequests';
import { onRequest } from 'firebase-functions/v2/https';
import { findSimilarStatements } from './fn_findSimilarStatements';
import { updateApprovalResults } from './fn_approval';
import { setImportanceToStatement } from './fn_importance';
import { updateAgrees } from './fn_agree';
import { setUserSettings } from './fn_users';
import { updateStatementWithViews } from './fn_views';
import { updateSettings } from './fn_statementsSettings';
import { Collections } from '../../src/types/enums';

initializeApp();
export const db = getFirestore();

exports.setUserSettings = onDocumentCreated(
	`/${Collections.users}/{userId}`,
	setUserSettings
);

exports.updateParentWithNewMessage = onDocumentCreated(
	`/${Collections.statements}/{statementId}`,
	updateParentWithNewMessageCB
);

//update statements with the amount of  members
//TODO: There is a problem. because the subscription contain also the full-statement, every time something in the statement is updated, the subscription is updated as well.
exports.updateMembers = onDocumentWritten(
	`/${Collections.statementsSubscribe}/{subscriptionId}`,
	updateStatementNumberOfMembers
);

//evaluations and results
exports.onSetChoseBySettings = onDocumentWritten(
	`/${Collections.choseBy}/{statementId}`,
	updateChosenOptions
);

exports.newEvaluation = onDocumentCreated(
	{ document: `/${Collections.evaluations}/{evaluationId}` },
	newEvaluation
);
exports.deleteEvaluation = onDocumentDeleted(
	`/${Collections.evaluations}/{evaluationId}`,
	deleteEvaluation
);

exports.updateEvaluation = onDocumentUpdated(
	`/${Collections.evaluations}/{evaluationId}`,
	updateEvaluation
);
exports.updateResultsSettings = onDocumentWritten(
	`${Collections.resultsTriggers}/{statementId}`,
	updateResultsSettings
);

//votes
exports.addVote = onDocumentWritten('/votes/{voteId}', updateVote);

//timers
exports.cleanTimers = onSchedule('every day 00:00', cleanOldTimers);

//roles
exports.setAdminsToNewStatement = onDocumentCreated(
	`/${Collections.statements}/{statementId}`,
	setAdminsToNewStatement
);

//approval
exports.updateDocumentApproval = onDocumentWritten(
	`/${Collections.approval}/{approvalId}`,
	updateApprovalResults
);

//importance
exports.setImportanceToStatement = onDocumentWritten(
	`/${Collections.importance}/{importanceId}`,
	setImportanceToStatement
);

//agree/disagree
exports.updateAgrees = onDocumentWritten(
	`/${Collections.agrees}/{agreeId}`,
	updateAgrees
);

//signatures
exports.updateDocumentSignatures = onDocumentWritten(
	`/${Collections.signatures}/{signatureId}`,
	updateDocumentSignatures
);

//views
exports.updateStatementWithViews = onDocumentCreated(
	`/${Collections.statementViews}/{viewId}`,
	updateStatementWithViews
);

//statements settings
exports.writeStatementSettings = onDocumentWritten(
	`/${Collections.statementsSettings}/{statementId}`,
	updateSettings
);

//http requests
const isProduction = process.env.NODE_ENV === 'production';

console.info('isProduction', isProduction);
const cors = {
	cors: ['https://freedi-test.web.app/'],
};

exports.getRandomStatements = onRequest(cors, getRandomStatements);
exports.getTopStatements = onRequest(cors, getTopStatements);
exports.getUserOptions = onRequest(cors, getUserOptions);
exports.checkPassword = onRequest(cors, checkPassword);
exports.hashPassword = onRequest(cors, hashPassword);
exports.checkForSimilarStatements = onRequest(cors, findSimilarStatements);
