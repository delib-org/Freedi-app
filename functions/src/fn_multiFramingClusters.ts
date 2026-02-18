import { GoogleGenerativeAI } from '@google/generative-ai';
import {
	Collections,
	getRandomUID,
	Statement,
	StatementSchema,
	StatementType,
} from '@freedi/shared-types';
import { Framing, FramingRequest, FramingSnapshot, ClusterSnapshot } from '@freedi/shared-types';
import { Response, Request, onInit, logger } from 'firebase-functions/v1';
import { parse } from 'valibot';
import { db } from '.';
import { GEMINI_MODEL } from './config/gemini';

// New collection names (not yet in delib-npm)
const FRAMING_COLLECTIONS = {
	framings: 'framings',
	framingRequests: 'framingRequests',
	clusterAggregations: 'clusterAggregations',
	framingSnapshots: 'framingSnapshots',
} as const;

// Extended Statement type with framing-specific fields
interface StatementWithFraming extends Statement {
	framingId?: string;
	framingClusters?: Record<string, string>;
}

interface SimpleDescendant {
	statement: string;
	statementId: string;
}

interface AIFraming {
	framingName: string;
	framingDescription: string;
	groups: {
		groupName: string;
		statements: SimpleDescendant[];
	}[];
}

let genAI: GoogleGenerativeAI;

onInit(() => {
	try {
		if (!process.env.GOOGLE_API_KEY) {
			throw new Error('Missing GOOGLE_API_KEY environment variable');
		}

		genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
	} catch (error) {
		console.error('Error initializing GenAI', error);
	}
});

/**
 * Generate up to 3 AI framings for a given statement
 * Each framing offers a different perspective on how to cluster the options
 */
export async function generateMultipleFramings(req: Request, res: Response): Promise<void> {
	try {
		const { statementId, maxFramings = 3 } = req.body;

		if (!statementId || typeof statementId !== 'string') {
			res.status(400).send({ error: 'Invalid input: statementId is required', ok: false });

			return;
		}

		// Fetch topic and descendants
		const [topicDB, descendantsDB] = await Promise.all([
			db.collection(Collections.statements).doc(statementId).get(),
			db.collection(Collections.statements).where('parentId', '==', statementId).get(),
		]);

		const topic = topicDB.data() as Statement;

		if (!topic || !topic.statementId) {
			res.status(400).send({ error: 'Invalid input: topic not found', ok: false });

			return;
		}

		// Filter out existing clusters
		const descendants = descendantsDB.docs
			.map((doc) => parse(StatementSchema, doc.data()))
			.filter((statement) => statement.isCluster !== true) as Statement[];

		if (!descendants || descendants.length === 0) {
			logger.info('No descendants found for the given statementId:', statementId);
			res.status(200).send({
				message: 'No descendants found',
				framings: [],
				ok: true,
			});

			return;
		}

		const simpleDescendants: SimpleDescendant[] = descendants.map((descendant) => ({
			statement: descendant.statement,
			statementId: descendant.statementId,
		}));

		// Generate multiple framings using AI
		const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = buildMultiFramingPrompt(topic, simpleDescendants, maxFramings);
		const response = await model.generateContent(prompt);

		if (!response) {
			throw new Error('Error generating response from model');
		}

		const result = response.response;
		const text = result.text();

		const aiFramings = parseMultiFramingResponse(text);

		if (!aiFramings || aiFramings.length === 0) {
			throw new Error('Error parsing response: no valid framings found');
		}

		// Create framings and clusters in database
		const createdFramings = await createFramingsInDatabase(topic, descendants, aiFramings);

		logger.info(
			`Successfully created ${createdFramings.length} framings for statement ${statementId}`,
		);

		res.status(200).send({
			framings: createdFramings,
			rawResponse: text,
			ok: true,
		});
	} catch (error) {
		logger.error('Error generating multiple framings:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

/**
 * Admin requests a custom framing with specific prompt
 */
export async function requestCustomFraming(req: Request, res: Response): Promise<void> {
	try {
		const { statementId, customPrompt, userId } = req.body;

		if (!statementId || typeof statementId !== 'string') {
			res.status(400).send({ error: 'Invalid input: statementId is required', ok: false });

			return;
		}

		if (!customPrompt || typeof customPrompt !== 'string') {
			res.status(400).send({ error: 'Invalid input: customPrompt is required', ok: false });

			return;
		}

		if (!userId || typeof userId !== 'string') {
			res.status(400).send({ error: 'Invalid input: userId is required', ok: false });

			return;
		}

		// Create request document
		const requestId = getRandomUID();
		const framingRequest: FramingRequest = {
			requestId,
			parentStatementId: statementId,
			customPrompt,
			requestedBy: userId,
			requestedAt: Date.now(),
			status: 'processing',
		};

		await db.collection(FRAMING_COLLECTIONS.framingRequests).doc(requestId).set(framingRequest);

		// Fetch topic and descendants
		const [topicDB, descendantsDB] = await Promise.all([
			db.collection(Collections.statements).doc(statementId).get(),
			db.collection(Collections.statements).where('parentId', '==', statementId).get(),
		]);

		const topic = topicDB.data() as Statement;

		if (!topic || !topic.statementId) {
			await updateFramingRequestStatus(requestId, 'failed', undefined, 'Topic not found');
			res.status(400).send({ error: 'Invalid input: topic not found', ok: false });

			return;
		}

		// Filter out existing clusters
		const descendants = descendantsDB.docs
			.map((doc) => parse(StatementSchema, doc.data()))
			.filter((statement) => statement.isCluster !== true) as Statement[];

		if (!descendants || descendants.length === 0) {
			await updateFramingRequestStatus(requestId, 'failed', undefined, 'No descendants found');
			res.status(200).send({
				message: 'No descendants found',
				ok: false,
			});

			return;
		}

		const simpleDescendants: SimpleDescendant[] = descendants.map((descendant) => ({
			statement: descendant.statement,
			statementId: descendant.statementId,
		}));

		// Generate custom framing using AI
		const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = buildCustomFramingPrompt(topic, simpleDescendants, customPrompt);
		const response = await model.generateContent(prompt);

		if (!response) {
			await updateFramingRequestStatus(
				requestId,
				'failed',
				undefined,
				'Error generating response from model',
			);
			throw new Error('Error generating response from model');
		}

		const result = response.response;
		const text = result.text();

		const aiFramings = parseMultiFramingResponse(text);

		if (!aiFramings || aiFramings.length === 0) {
			await updateFramingRequestStatus(
				requestId,
				'failed',
				undefined,
				'Error parsing response: no valid framings found',
			);
			throw new Error('Error parsing response: no valid framings found');
		}

		// Take only the first framing from the response
		const aiFraming = aiFramings[0];

		// Get existing framings count for order
		const existingFramings = await db
			.collection(FRAMING_COLLECTIONS.framings)
			.where('parentStatementId', '==', statementId)
			.get();

		const order = existingFramings.size;

		// Create framing in database
		const framing = await createSingleFraming(
			topic,
			descendants,
			aiFraming,
			order,
			'admin',
			userId,
			customPrompt,
		);

		// Update request status
		await updateFramingRequestStatus(requestId, 'completed', framing.framingId);

		logger.info(
			`Successfully created custom framing ${framing.framingId} for statement ${statementId}`,
		);

		res.status(200).send({
			framing,
			requestId,
			ok: true,
		});
	} catch (error) {
		logger.error('Error creating custom framing:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

/**
 * Get all framings for a statement
 */
export async function getFramingsForStatement(req: Request, res: Response): Promise<void> {
	try {
		const { statementId } = req.query;

		if (!statementId || typeof statementId !== 'string') {
			res.status(400).send({ error: 'Invalid input: statementId is required', ok: false });

			return;
		}

		const framingsSnapshot = await db
			.collection(FRAMING_COLLECTIONS.framings)
			.where('parentStatementId', '==', statementId)
			.orderBy('order', 'asc')
			.get();

		const framings: Framing[] = framingsSnapshot.docs.map((doc) => doc.data() as Framing);

		res.status(200).send({
			framings,
			ok: true,
		});
	} catch (error) {
		logger.error('Error getting framings:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

/**
 * Get clusters for a specific framing
 */
export async function getFramingClusters(req: Request, res: Response): Promise<void> {
	try {
		const { framingId } = req.query;

		if (!framingId || typeof framingId !== 'string') {
			res.status(400).send({ error: 'Invalid input: framingId is required', ok: false });

			return;
		}

		// Get framing
		const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

		if (!framingDoc.exists) {
			res.status(404).send({ error: 'Framing not found', ok: false });

			return;
		}

		const framing = framingDoc.data() as Framing;

		// Get cluster statements
		const clusterPromises = framing.clusterIds.map((clusterId) =>
			db.collection(Collections.statements).doc(clusterId).get(),
		);

		const clusterDocs = await Promise.all(clusterPromises);

		const clusters: Statement[] = clusterDocs
			.filter((doc) => doc.exists)
			.map((doc) => doc.data() as Statement);

		// For each cluster, get the options within it
		const clustersWithOptions = await Promise.all(
			clusters.map(async (cluster) => {
				const optionsSnapshot = await db
					.collection(Collections.statements)
					.where('parentId', '==', cluster.statementId)
					.get();

				const options: Statement[] = optionsSnapshot.docs.map((doc) => doc.data() as Statement);

				return {
					cluster,
					options,
					optionCount: options.length,
				};
			}),
		);

		res.status(200).send({
			framing,
			clusters: clustersWithOptions,
			ok: true,
		});
	} catch (error) {
		logger.error('Error getting framing clusters:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildMultiFramingPrompt(
	topic: Statement,
	statements: SimpleDescendant[],
	maxFramings: number,
): string {
	return `
You are an expert at analyzing and organizing ideas. I need you to create ${maxFramings} different ways to cluster/group the following statements based on different perspectives.

Topic: "${topic.statement}"

Statements to cluster:
${JSON.stringify(statements, null, 2)}

Your task:
1. Create ${maxFramings} DIFFERENT framings (perspectives) for clustering these statements.
2. Each framing should offer a unique lens for understanding the statements:
   - For example: by theme, by impact type, by stakeholder affected, by implementation difficulty, by time horizon, etc.
3. Each framing should have:
   - A clear name describing the clustering perspective
   - A brief description explaining the rationale
   - Groups that cluster the statements according to that perspective
4. Within each group:
   - Consolidate similar statements (choose the clearest version)
   - Use the statementId of the best/clearest statement when merging similar ones
5. Name groups in the primary language of the statements.

Return your response as a JSON array with this exact structure:
[
  {
    "framingName": "Name of this framing perspective",
    "framingDescription": "Brief explanation of how statements are grouped in this framing",
    "groups": [
      {
        "groupName": "Name of the cluster",
        "statements": [
          {"statement": "Selected statement text", "statementId": "id1"},
          {"statement": "Selected statement text", "statementId": "id2"}
        ]
      }
    ]
  }
]

IMPORTANT:
- Each framing MUST be genuinely different (different logic for grouping)
- Each statement should appear in exactly one group per framing
- Return ONLY the JSON array, no additional text
`;
}

function buildCustomFramingPrompt(
	topic: Statement,
	statements: SimpleDescendant[],
	customPrompt: string,
): string {
	return `
You are an expert at analyzing and organizing ideas. I need you to cluster the following statements based on a specific perspective requested by the user.

Topic: "${topic.statement}"

User's clustering request: "${customPrompt}"

Statements to cluster:
${JSON.stringify(statements, null, 2)}

Your task:
1. Create a clustering/grouping based on the user's request: "${customPrompt}"
2. Create logical groups that align with this perspective
3. Within each group:
   - Consolidate similar statements (choose the clearest version)
   - Use the statementId of the best/clearest statement when merging similar ones
4. Name groups in the primary language of the statements

Return your response as a JSON array with this exact structure:
[
  {
    "framingName": "Name describing this clustering perspective",
    "framingDescription": "Brief explanation based on: ${customPrompt}",
    "groups": [
      {
        "groupName": "Name of the cluster",
        "statements": [
          {"statement": "Selected statement text", "statementId": "id1"},
          {"statement": "Selected statement text", "statementId": "id2"}
        ]
      }
    ]
  }
]

IMPORTANT:
- Focus on the perspective requested: "${customPrompt}"
- Each statement should appear in exactly one group
- Return ONLY the JSON array, no additional text
`;
}

function parseMultiFramingResponse(text: string): AIFraming[] | null {
	try {
		// Clean the response
		let jsonString = text.replace(/```json/g, '');
		jsonString = jsonString.replace(/```/g, '');
		jsonString = jsonString.replace(/^>\s*/gm, '');
		jsonString = jsonString.trim();

		const parsed = JSON.parse(jsonString);

		if (!Array.isArray(parsed)) {
			logger.error('Response is not an array');

			return null;
		}

		// Validate structure
		for (const framing of parsed) {
			if (!framing.framingName || !framing.framingDescription || !Array.isArray(framing.groups)) {
				logger.error('Invalid framing structure:', framing);

				return null;
			}
		}

		return parsed as AIFraming[];
	} catch (error) {
		logger.error('Error parsing multi-framing response:', error);

		return null;
	}
}

async function createFramingsInDatabase(
	topic: Statement,
	descendants: Statement[],
	aiFramings: AIFraming[],
): Promise<Framing[]> {
	const createdFramings: Framing[] = [];

	// Get existing framings count for ordering
	const existingFramings = await db
		.collection(FRAMING_COLLECTIONS.framings)
		.where('parentStatementId', '==', topic.statementId)
		.get();

	let order = existingFramings.size;

	for (const aiFraming of aiFramings) {
		const framing = await createSingleFraming(topic, descendants, aiFraming, order, 'ai');
		createdFramings.push(framing);
		order++;
	}

	return createdFramings;
}

async function createSingleFraming(
	topic: Statement,
	descendants: Statement[],
	aiFraming: AIFraming,
	order: number,
	createdBy: 'ai' | 'admin',
	creatorId?: string,
	customPrompt?: string,
): Promise<Framing> {
	const framingId = getRandomUID();
	const clusterIds: string[] = [];
	const clusterSnapshots: ClusterSnapshot[] = [];

	const batch = db.batch();

	// Create cluster statements for this framing
	for (const group of aiFraming.groups) {
		const clusterId = getRandomUID();
		clusterIds.push(clusterId);

		// Create cluster statement with framing reference
		const clusterStatement: StatementWithFraming = {
			statement: group.groupName,
			isCluster: true,
			statementId: clusterId,
			parentId: topic.statementId,
			parents: [...(topic.parents || []), topic.statementId],
			topParentId: topic.topParentId,
			statementType: StatementType.option,
			createdAt: Date.now(),
			creator: topic.creator,
			creatorId: topic.creatorId,
			consensus: 0,
			randomSeed: Math.random(),
			lastUpdate: Date.now(),
			// Store framingId on cluster for reference
			framingId,
		};

		const clusterRef = db.collection(Collections.statements).doc(clusterId);
		batch.set(clusterRef, clusterStatement);

		// Collect option IDs for snapshot
		const optionIds = group.statements.map((s) => s.statementId);
		clusterSnapshots.push({
			clusterId,
			clusterName: group.groupName,
			optionIds,
		});

		// Update options to point to this cluster
		// NOTE: This creates a copy - options now have multiple parents across framings
		// The original parentId is preserved; we just track the cluster association
		for (const statementRef of group.statements) {
			// Find the original statement to update
			const originalStatement = descendants.find((d) => d.statementId === statementRef.statementId);
			if (originalStatement) {
				const optionRef = db.collection(Collections.statements).doc(statementRef.statementId);
				// Add framing-cluster mapping without changing the original parentId
				batch.update(optionRef, {
					[`framingClusters.${framingId}`]: clusterId,
					lastUpdate: Date.now(),
				});
			}
		}
	}

	await batch.commit();

	// Create framing document
	const framing: Framing = {
		framingId,
		parentStatementId: topic.statementId,
		name: aiFraming.framingName,
		description: aiFraming.framingDescription,
		prompt: customPrompt,
		createdAt: Date.now(),
		createdBy,
		creatorId,
		isActive: true,
		clusterIds,
		order,
	};

	await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).set(framing);

	// Save snapshot for recovery
	const snapshot: FramingSnapshot = {
		snapshotId: getRandomUID(),
		framingId,
		parentStatementId: topic.statementId,
		clusters: clusterSnapshots,
		createdAt: Date.now(),
	};

	await db.collection(FRAMING_COLLECTIONS.framingSnapshots).doc(snapshot.snapshotId).set(snapshot);

	logger.info(`Created framing ${framingId} with ${clusterIds.length} clusters`);

	return framing;
}

async function updateFramingRequestStatus(
	requestId: string,
	status: FramingRequest['status'],
	resultFramingId?: string,
	error?: string,
): Promise<void> {
	const updateData: Partial<FramingRequest> = { status };

	if (resultFramingId) {
		updateData.resultFramingId = resultFramingId;
	}

	if (error) {
		updateData.error = error;
	}

	await db.collection(FRAMING_COLLECTIONS.framingRequests).doc(requestId).update(updateData);
}

/**
 * Delete a framing and its associated clusters
 */
export async function deleteFraming(req: Request, res: Response): Promise<void> {
	try {
		const { framingId } = req.body;

		if (!framingId || typeof framingId !== 'string') {
			res.status(400).send({ error: 'Invalid input: framingId is required', ok: false });

			return;
		}

		// Get framing
		const framingDoc = await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).get();

		if (!framingDoc.exists) {
			res.status(404).send({ error: 'Framing not found', ok: false });

			return;
		}

		const framing = framingDoc.data() as Framing;

		const batch = db.batch();

		// Delete cluster statements
		for (const clusterId of framing.clusterIds) {
			const clusterRef = db.collection(Collections.statements).doc(clusterId);
			batch.delete(clusterRef);
		}

		// Delete framing document
		batch.delete(db.collection(FRAMING_COLLECTIONS.framings).doc(framingId));

		// Delete associated aggregations
		const aggregationsSnapshot = await db
			.collection(FRAMING_COLLECTIONS.clusterAggregations)
			.where('framingId', '==', framingId)
			.get();

		aggregationsSnapshot.docs.forEach((doc) => {
			batch.delete(doc.ref);
		});

		await batch.commit();

		// Clean up framing-cluster mappings from statements
		const statementsWithMapping = await db
			.collection(Collections.statements)
			.where(`framingClusters.${framingId}`, '!=', null)
			.get();

		if (!statementsWithMapping.empty) {
			const cleanupBatch = db.batch();
			statementsWithMapping.docs.forEach((doc) => {
				cleanupBatch.update(doc.ref, {
					[`framingClusters.${framingId}`]: null,
				});
			});
			await cleanupBatch.commit();
		}

		logger.info(`Deleted framing ${framingId} with ${framing.clusterIds.length} clusters`);

		res.status(200).send({
			message: `Framing ${framingId} deleted successfully`,
			ok: true,
		});
	} catch (error) {
		logger.error('Error deleting framing:', error);
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}
