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

import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';

import { onRequest } from 'firebase-functions/v2/https';

// The Firebase Admin SDK to access Firestore.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
import { Collections } from '../../src/types/TypeEnums';
import { Request, Response } from 'firebase-functions/v1';
import { functionConfig } from '../../src/types/ConfigFunctions';

// Initialize Firebase
initializeApp();
export const db = getFirestore();

// HTTP function wrapper with error handling
const wrapHttpFunction = (
	handler: (req: Request, res: Response) => Promise<void>
) => {
	return onRequest(
		{
			...functionConfig,
			cors: [
				'https://freedi-test.web.app',
				'https://delib-5.web.app',
				'https://freedi.tech',
				'https://delib.web.app',
				'http://localhost:5173/',
			],
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

// HTTP Functions
exports.getRandomStatements = wrapHttpFunction(getRandomStatements);
exports.getTopStatements = wrapHttpFunction(getTopStatements);
exports.getUserOptions = wrapHttpFunction(getUserOptions);
exports.checkForSimilarStatements = wrapHttpFunction(findSimilarStatements);
exports.massConsensusGetInitialData = wrapHttpFunction(getInitialMCData);
exports.getQuestionOptions = wrapHttpFunction(getQuestionOptions);

// Firestore Triggers
exports.setUserSettings = onDocumentCreated(
	{
		document: `/${Collections.users}/{userId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await setUserSettings(event);
		} catch (error) {
			console.error('Error in setUserSettings:', error);
			throw error;
		}
	}
);

exports.updateParentWithNewMessage = onDocumentCreated(
	{
		document: `/${Collections.statements}/{statementId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateParentWithNewMessageCB(event);
		} catch (error) {
			console.error('Error in updateParentWithNewMessage:', error);
			throw error;
		}
	}
);

exports.updateMembers = onDocumentWritten(
	{
		document: `/${Collections.statementsSubscribe}/{subscriptionId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateStatementNumberOfMembers(event);
		} catch (error) {
			console.error('Error in updateMembers:', error);
			throw error;
		}
	}
);

exports.onSetChoseBySettings = onDocumentWritten(
	{
		document: `/${Collections.choseBy}/{statementId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateChosenOptions(event);
		} catch (error) {
			console.error('Error in onSetChoseBySettings:', error);
			throw error;
		}
	}
);

exports.newEvaluation = onDocumentCreated(
	{
		document: `/${Collections.evaluations}/{evaluationId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await newEvaluation(event);
		} catch (error) {
			console.error('Error in newEvaluation:', error);
			throw error;
		}
	}
);

exports.deleteEvaluation = onDocumentDeleted(
	{
		document: `/${Collections.evaluations}/{evaluationId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await deleteEvaluation(event);
		} catch (error) {
			console.error('Error in deleteEvaluation:', error);
			throw error;
		}
	}
);

exports.updateEvaluation = onDocumentUpdated(
	{
		document: `/${Collections.evaluations}/{evaluationId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateEvaluation(event);
		} catch (error) {
			console.error('Error in updateEvaluation:', error);
			throw error;
		}
	}
);

exports.updateResultsSettings = onDocumentWritten(
	{
		document: `${Collections.resultsTriggers}/{statementId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateResultsSettings(event);
		} catch (error) {
			console.error('Error in updateResultsSettings:', error);
			throw error;
		}
	}
);

exports.addVote = onDocumentWritten(
	{
		document: '/votes/{voteId}',
		...functionConfig,
	},
	async (event) => {
		try {
			await updateVote(event);
		} catch (error) {
			console.error('Error in addVote:', error);
			throw error;
		}
	}
);

exports.setAdminsToNewStatement = onDocumentCreated(
	{
		document: `/${Collections.statements}/{statementId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await setAdminsToNewStatement(event);
		} catch (error) {
			console.error('Error in setAdminsToNewStatement:', error);
			throw error;
		}
	}
);

exports.updateDocumentApproval = onDocumentWritten(
	{
		document: `/${Collections.approval}/{approvalId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateApprovalResults(event);
		} catch (error) {
			console.error('Error in updateDocumentApproval:', error);
			throw error;
		}
	}
);

exports.setImportanceToStatement = onDocumentWritten(
	{
		document: `/${Collections.importance}/{importanceId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await setImportanceToStatement(event);
		} catch (error) {
			console.error('Error in setImportanceToStatement:', error);
			throw error;
		}
	}
);

exports.updateAgrees = onDocumentWritten(
	{
		document: `/${Collections.agrees}/{agreeId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateAgrees(event);
		} catch (error) {
			console.error('Error in updateAgrees:', error);
			throw error;
		}
	}
);

exports.updateStatementWithViews = onDocumentCreated(
	{
		document: `/${Collections.statementViews}/{viewId}`,
		...functionConfig,
	},
	async (event) => {
		try {
			await updateStatementWithViews(event);
		} catch (error) {
			console.error('Error in updateStatementWithViews:', error);
			throw error;
		}
	}
);

const isProduction = process.env.NODE_ENV === 'production';
console.info('isProduction', isProduction);
