/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
import functions = require('firebase-functions');


import { Collections } from "delib-npm";

import { deleteEvaluation, newEvaluation, updateEvaluation } from "./fn_evaluation";
import { updateResultsSettings } from "./fn_results";
import { countRoomJoiners } from "./fn_rooms";
import { addSignature, removeSignature } from "./fn_signatures";
import {

	updateParentWithNewMessageCB,

	// updateSubscribedListenersCB,

} from "./fn_statements";
import { updateVote } from "./fn_vote";

import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from "firebase-functions/v2/firestore";

import { onSchedule } from "firebase-functions/v2/scheduler";

// The Firebase Admin SDK to access Firestore.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { sendNotificationsCB } from "./fn_notifications";
import { cleanOldTimers } from "./fn_timers";
import { setAdminsToNewStatement } from "./fn_roles";
import { updateStatementNumberOfMembers } from "./fn_subscriptions";
import { getRandomStatements, getTopStatements, getUserOptions } from './fn_httpRequests';
import { onRequest } from 'firebase-functions/v2/https';
import { findSimilarStatements } from './fn_findSimilarStatements';

initializeApp();
export const db = getFirestore();

// update subscribers when statement is updated
//statements
// exports.updateSubscribedListeners = onDocumentUpdated(
//     `/${Collections.statements}/{statementId}`,
//     updateSubscribedListenersCB,
// );


exports.checkForSimilarStatements = onRequest(
	{ timeoutSeconds: 1200, cors: ['https://delib-testing.web.app/'] },
	findSimilarStatements
);

exports.updateParentWithNewMessage = onDocumentCreated(
	`/${Collections.statements}/{statementId}`,
	updateParentWithNewMessageCB);

//update statements with the amount of  members
exports.updateMembers = onDocumentWritten(`/${Collections.statementsSubscribe}/{subscriptionId}`, updateStatementNumberOfMembers);

//notifications
exports.updateNotifications = onDocumentCreated(
	`/${Collections.statements}/{statementId}`,
	sendNotificationsCB,
);

//evaluations and results
exports.newEvaluation = onDocumentCreated(`/${Collections.evaluations}/{evaluationId}`, newEvaluation);
exports.deleteEvaluation = onDocumentDeleted(`/${Collections.evaluations}/{evaluationId}`, deleteEvaluation);

exports.updateEvaluation = onDocumentUpdated(
	`/${Collections.evaluations}/{evaluationId}`,
	updateEvaluation,
);
exports.updateResultsSettings = onDocumentWritten(
	`${Collections.resultsTriggers}/{statementId}`,
	updateResultsSettings,
);

//votes
exports.addVote = onDocumentWritten("/votes/{voteId}", updateVote);

// exports.removeVote = onDocumentDeleted('/votes/{voteId}', removeVote);

//signatures (part of delib-signatures)
exports.changeSignature = onDocumentCreated(
	"/statementsSignatures/{signatureId}",
	addSignature,
);
exports.deleteSignature = onDocumentDeleted(
	"/statementsSignatures/{signatureId}",
	removeSignature,
);

//rooms
exports.countRoomJoiners = onDocumentWritten(
	`${Collections.statementRoomsAsked}/{requestId}`,
	countRoomJoiners,
);

//timers
exports.cleanTimers = onSchedule("every day 00:00", cleanOldTimers)

//roles
exports.setAdminsToNewStatement = onDocumentCreated(`/${Collections.statements}/{statementId}`, setAdminsToNewStatement);

//http requests
exports.getRandomStatements = functions.https.onRequest(getRandomStatements);
exports.getTopStatements = functions.https.onRequest(getTopStatements);
exports.getUserOptions = functions.https.onRequest(getUserOptions);


