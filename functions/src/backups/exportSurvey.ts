/**
 * Reusable backup logic shared between the CLI script
 * (scripts/exportProdQuestion.ts) and Cloud Functions
 * (scheduledDailyBackups + backupSurveyOnRequest + backupSurveyCallable).
 *
 * Pure function: takes injected Firestore + Storage clients, runs the export,
 * uploads JSON to GCS, returns destination + collection counts. No env vars,
 * no process.exit, no CLI side effects.
 */

import { Firestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';

export interface ExportSurveyOptions {
	questionId: string;
	/** GCP project id of the SOURCE Firestore (recorded in the backup meta). */
	sourceProjectId: string;
	/**
	 * Destination — must be either:
	 *   `gs://<bucket>/<object-path>` — explicit GCS URL
	 *   `{ bucket, keyPrefix }`       — bucket + prefix; the helper adds the
	 *                                   final filename `<timestamp>.json`
	 */
	destination: string | { bucket: string; keyPrefix: string };
	/** Optional cap on BFS depth when walking descendants. */
	maxDepth?: number;
	/**
	 * When set, the backup is taken in the context of an MC admin survey doc
	 * (from the `surveys` collection). The helper also embeds:
	 *   - the survey doc itself
	 *   - all surveyProgress rows for that survey
	 * so the bundle is self-contained even though the linked statement tree
	 * doesn't reference the MC survey directly.
	 */
	mcSurveyId?: string;
}

export interface ExportSurveyResult {
	destination: string;
	counts: Record<string, number>;
	descendantCount: number;
	bytes: number;
}

type Doc = Record<string, unknown>;

export async function exportSurveyToGcs(
	db: Firestore,
	storage: Storage,
	options: ExportSurveyOptions,
): Promise<ExportSurveyResult> {
	const { questionId, sourceProjectId, mcSurveyId, maxDepth = Number.POSITIVE_INFINITY } = options;

	// ----- helpers -----
	const fetchByFieldIn = async (
		collection: string,
		field: string,
		values: string[],
		idField: string,
	): Promise<Doc[]> => {
		const results: Doc[] = [];
		if (values.length === 0) return results;
		for (let i = 0; i < values.length; i += 30) {
			const slice = values.slice(i, i + 30);
			const snap = await db.collection(collection).where(field, 'in', slice).get();
			snap.forEach((doc) => results.push({ ...(doc.data() as Doc), [idField]: doc.id }));
		}
		return results;
	};

	const fetchByFieldEquals = async (
		collection: string,
		field: string,
		value: string,
		idField: string,
	): Promise<Doc[]> => {
		const results: Doc[] = [];
		const snap = await db.collection(collection).where(field, '==', value).get();
		snap.forEach((doc) => results.push({ ...(doc.data() as Doc), [idField]: doc.id }));
		return results;
	};

	const fetchDocsByIds = async (
		collection: string,
		ids: string[],
		idField: string,
	): Promise<Doc[]> => {
		const results: Doc[] = [];
		if (ids.length === 0) return results;
		for (let i = 0; i < ids.length; i += 30) {
			const slice = ids.slice(i, i + 30);
			const refs = slice.map((id) => db.collection(collection).doc(id));
			const docs = await db.getAll(...refs);
			docs.forEach((doc) => {
				if (doc.exists) results.push({ ...(doc.data() as Doc), [idField]: doc.id });
			});
		}
		return results;
	};

	interface SubEntry {
		parentStatementId: string;
		docId: string;
		data: Doc;
	}
	const fetchSubcollection = async (
		parentIds: string[],
		subcollection: string,
	): Promise<SubEntry[]> => {
		const results: SubEntry[] = [];
		for (const parentStatementId of parentIds) {
			const snap = await db
				.collection('statements')
				.doc(parentStatementId)
				.collection(subcollection)
				.get();
			snap.forEach((doc) =>
				results.push({ parentStatementId, docId: doc.id, data: doc.data() as Doc }),
			);
		}
		return results;
	};

	// ----- step 1: question doc -----
	const questionDoc = await db.collection('statements').doc(questionId).get();
	if (!questionDoc.exists) {
		throw new Error(`Question ${questionId} not found in project ${sourceProjectId}`);
	}
	const question: Doc = { ...(questionDoc.data() as Doc), statementId: questionId };

	// ----- step 2: all descendants -----
	const allStatements = new Map<string, Doc>();
	allStatements.set(questionId, question);

	const byTopParent = await db
		.collection('statements')
		.where('topParentId', '==', questionId)
		.get();
	byTopParent.forEach((doc) =>
		allStatements.set(doc.id, { ...doc.data(), statementId: doc.id }),
	);

	const queue: string[] = [questionId];
	const visitedParents = new Set<string>();
	let depth = 0;
	while (queue.length > 0 && depth <= maxDepth) {
		const next: string[] = [];
		const batch = queue.splice(0, queue.length);
		for (const parentId of batch) {
			if (visitedParents.has(parentId)) continue;
			visitedParents.add(parentId);
			const children = await db.collection('statements').where('parentId', '==', parentId).get();
			children.forEach((doc) => {
				if (!allStatements.has(doc.id)) {
					allStatements.set(doc.id, { ...doc.data(), statementId: doc.id });
					next.push(doc.id);
				}
			});
		}
		queue.push(...next);
		depth++;
	}

	const statements = Array.from(allStatements.values());
	const descendantIds = statements.map((s) => s.statementId as string);

	// ----- step 3: subscriptions + evaluations -----
	const subscriptions = await fetchByFieldEquals(
		'statementsSubscribe',
		'statementId',
		questionId,
		'id',
	);
	const evaluations = await fetchByFieldIn('evaluations', 'parentId', descendantIds, 'evaluationId');

	// ----- step 4: cluster artifacts -----
	const clusterAggregations: Doc[] = [];
	const clusterEvaluationLinks: Doc[] = [];
	const clusterIds = statements
		.filter((s) => s.isCluster === true)
		.map((s) => s.statementId as string);
	if (clusterIds.length > 0) {
		for (let i = 0; i < clusterIds.length; i += 30) {
			const slice = clusterIds.slice(i, i + 30);
			const snap = await db
				.collection('clusterEvaluationLinks')
				.where('clusterId', 'in', slice)
				.get();
			snap.forEach((doc) => clusterEvaluationLinks.push({ ...doc.data(), id: doc.id }));
		}
		const aggSnap = await db.collection('clusterAggregations').get();
		const clusterIdSet = new Set(clusterIds);
		aggSnap.forEach((doc) => {
			const id = doc.id;
			const sep = id.indexOf('--');
			const cid = sep === -1 ? id : id.slice(0, sep);
			if (clusterIdSet.has(cid)) clusterAggregations.push({ ...doc.data(), id });
		});
	}

	// ----- step 5: survey-bound collections -----
	const votes = await fetchByFieldIn('votes', 'parentId', descendantIds, 'id');
	const agrees = await fetchByFieldIn('agrees', 'statementId', descendantIds, 'agreeId');
	const approval = await fetchByFieldIn('approval', 'documentId', descendantIds, 'id');
	const importance = await fetchByFieldIn('importance', 'parentId', descendantIds, 'importanceId');
	const choseBy = await fetchDocsByIds('choseBy', descendantIds, 'statementId');
	const results = await fetchDocsByIds('results', descendantIds, 'statementId');
	const suggestions = await fetchByFieldEquals(
		'suggestions',
		'topParentId',
		questionId,
		'suggestionId',
	);
	const userEvaluations = await fetchByFieldIn(
		'userEvaluations',
		'parentId',
		descendantIds,
		'id',
	);
	const polarizationIndex = await fetchByFieldIn(
		'polarizationIndex',
		'parentId',
		descendantIds,
		'id',
	);

	const statementSnapshots: Doc[] = [];
	for (const sid of descendantIds) {
		const snap = await db
			.collection('statementSnapshots')
			.where('topic.statementId', '==', sid)
			.get();
		snap.forEach((doc) => statementSnapshots.push({ ...doc.data(), id: doc.id }));
	}

	const userDemographicEvaluations = await fetchByFieldIn(
		'userDemographicEvaluations',
		'statementId',
		descendantIds,
		'id',
	);

	// userDemographicQuestions: three scopes — statement-scoped, group-scoped
	// via topParentId, and anchor-scoped via demographicAnchorId in evaluations.
	const demographicQuestionsById = new Map<string, Doc>();
	for (const d of await fetchByFieldIn(
		'userDemographicQuestions',
		'statementId',
		descendantIds,
		'userQuestionId',
	)) {
		demographicQuestionsById.set(d.userQuestionId as string, d);
	}
	for (const d of await fetchByFieldEquals(
		'userDemographicQuestions',
		'topParentId',
		questionId,
		'userQuestionId',
	)) {
		demographicQuestionsById.set(d.userQuestionId as string, d);
	}
	const anchorIds = Array.from(
		new Set(
			userDemographicEvaluations
				.map((e) => e.demographicAnchorId)
				.filter((x): x is string => typeof x === 'string' && x.length > 0),
		),
	);
	if (anchorIds.length > 0) {
		for (const d of await fetchByFieldIn(
			'userDemographicQuestions',
			'statementId',
			anchorIds,
			'userQuestionId',
		)) {
			demographicQuestionsById.set(d.userQuestionId as string, d);
		}
	}
	const userDemographicQuestions = Array.from(demographicQuestionsById.values());

	const surveyProgress = await fetchByFieldEquals(
		'surveyProgress',
		'surveyId',
		questionId,
		'id',
	);
	const moderationLogs = await fetchByFieldEquals(
		'moderationLogs',
		'topParentId',
		questionId,
		'id',
	);
	const researchLogs = await fetchByFieldEquals(
		'researchLogs',
		'topParentId',
		questionId,
		'logId',
	);
	const massConsensusProcesses = await fetchByFieldEquals(
		'massConsensusProcesses',
		'statementId',
		questionId,
		'id',
	);
	const massConsensusMembers = await fetchByFieldEquals(
		'massConsensusMembers',
		'statementId',
		questionId,
		'memberId',
	);
	const joinDelegates = await fetchByFieldEquals(
		'joinDelegates',
		'questionId',
		questionId,
		'id',
	);
	const joinDelegateInvitations = await fetchByFieldEquals(
		'joinDelegateInvitations',
		'questionId',
		questionId,
		'id',
	);
	const statementsSettings = await fetchDocsByIds('statementsSettings', descendantIds, 'statementId');
	const statementsMeta = await fetchDocsByIds('statementsMeta', descendantIds, 'statementId');
	const statementsPasswords = await fetchDocsByIds('statementsPasswords', descendantIds, 'statementId');
	const evidencePosts = await fetchByFieldIn('evidencePosts', 'parentId', descendantIds, 'id');
	const evidenceVotes = await fetchByFieldIn('evidenceVotes', 'parentId', descendantIds, 'id');
	const framings = await fetchByFieldIn('framings', 'topParentId', descendantIds, 'id');
	const framingRequests = await fetchByFieldIn(
		'framingRequests',
		'topParentId',
		descendantIds,
		'id',
	);
	const framingSnapshots = await fetchByFieldIn(
		'framingSnapshots',
		'topParentId',
		descendantIds,
		'id',
	);

	const statementHistory = await fetchSubcollection(descendantIds, 'statementHistory');
	const joinFormSubmissions = await fetchSubcollection([questionId], 'joinFormSubmissions');

	// MC admin context (optional): fetch the survey doc + all surveyProgress.
	let mcSurvey: Doc | null = null;
	const mcSurveyProgress: Doc[] = [];
	if (mcSurveyId) {
		const surveyDoc = await db.collection('surveys').doc(mcSurveyId).get();
		if (surveyDoc.exists) {
			mcSurvey = { ...(surveyDoc.data() as Doc), surveyId: surveyDoc.id };
		}
		const progressSnap = await db
			.collection('surveyProgress')
			.where('surveyId', '==', mcSurveyId)
			.get();
		progressSnap.forEach((doc) =>
			mcSurveyProgress.push({ ...(doc.data() as Doc), id: doc.id }),
		);
	}

	const counts: Record<string, number> = {
		statements: statements.length,
		evaluations: evaluations.length,
		subscriptions: subscriptions.length,
		clusterAggregations: clusterAggregations.length,
		clusterEvaluationLinks: clusterEvaluationLinks.length,
		votes: votes.length,
		agrees: agrees.length,
		approval: approval.length,
		importance: importance.length,
		choseBy: choseBy.length,
		results: results.length,
		suggestions: suggestions.length,
		userEvaluations: userEvaluations.length,
		polarizationIndex: polarizationIndex.length,
		statementSnapshots: statementSnapshots.length,
		userDemographicEvaluations: userDemographicEvaluations.length,
		userDemographicQuestions: userDemographicQuestions.length,
		surveyProgress: surveyProgress.length,
		moderationLogs: moderationLogs.length,
		researchLogs: researchLogs.length,
		massConsensusProcesses: massConsensusProcesses.length,
		massConsensusMembers: massConsensusMembers.length,
		joinDelegates: joinDelegates.length,
		joinDelegateInvitations: joinDelegateInvitations.length,
		statementsSettings: statementsSettings.length,
		statementsMeta: statementsMeta.length,
		statementsPasswords: statementsPasswords.length,
		evidencePosts: evidencePosts.length,
		evidenceVotes: evidenceVotes.length,
		framings: framings.length,
		framingRequests: framingRequests.length,
		framingSnapshots: framingSnapshots.length,
		statementHistory: statementHistory.length,
		joinFormSubmissions: joinFormSubmissions.length,
		mcSurvey: mcSurvey ? 1 : 0,
		mcSurveyProgress: mcSurveyProgress.length,
	};

	const payload = {
		meta: {
			exportVersion: 2,
			exportedAt: Date.now(),
			sourceProjectId,
			questionId,
			mcSurveyId: mcSurveyId ?? null,
			descendantCount: statements.length - 1,
			counts,
			statementCount: statements.length,
			evaluationCount: evaluations.length,
			subscriptionCount: subscriptions.length,
			clusterAggregationCount: clusterAggregations.length,
			clusterEvaluationLinkCount: clusterEvaluationLinks.length,
		},
		question,
		statements,
		evaluations,
		subscriptions,
		clusterAggregations,
		clusterEvaluationLinks,
		votes,
		agrees,
		approval,
		importance,
		choseBy,
		results,
		suggestions,
		userEvaluations,
		polarizationIndex,
		statementSnapshots,
		userDemographicEvaluations,
		userDemographicQuestions,
		surveyProgress,
		moderationLogs,
		researchLogs,
		massConsensusProcesses,
		massConsensusMembers,
		joinDelegates,
		joinDelegateInvitations,
		statementsSettings,
		statementsMeta,
		statementsPasswords,
		evidencePosts,
		evidenceVotes,
		framings,
		framingRequests,
		framingSnapshots,
		statementHistory,
		joinFormSubmissions,
		mcSurvey,
		mcSurveyProgress,
	};

	const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');

	// Resolve destination
	let bucketName: string;
	let objectName: string;
	if (typeof options.destination === 'string') {
		if (!options.destination.startsWith('gs://')) {
			throw new Error('destination must be a gs:// URL or {bucket, keyPrefix}');
		}
		const stripped = options.destination.replace(/^gs:\/\//, '');
		const slash = stripped.indexOf('/');
		if (slash === -1) throw new Error('Invalid gs:// URL');
		bucketName = stripped.slice(0, slash);
		objectName = stripped.slice(slash + 1);
	} else {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
		bucketName = options.destination.bucket;
		const prefix = options.destination.keyPrefix.replace(/\/+$/, '');
		objectName = `${prefix}/${stamp}.json`;
	}

	const bucket = storage.bucket(bucketName);
	const [exists] = await bucket.exists();
	if (!exists) {
		throw new Error(
			`GCS bucket gs://${bucketName} does not exist. Create it first (see docs/SURVEY_BACKUP_RESTORE.md).`,
		);
	}
	await bucket.file(objectName).save(body, {
		contentType: 'application/json',
		metadata: { cacheControl: 'no-store' },
	});

	return {
		destination: `gs://${bucketName}/${objectName}`,
		counts,
		descendantCount: statements.length - 1,
		bytes: body.length,
	};
}
