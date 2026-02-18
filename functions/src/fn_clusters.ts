import { GoogleGenerativeAI } from '@google/generative-ai';
import {
	Collections,
	getRandomUID,
	Statement,
	StatementSchema,
	StatementSnapShot,
	StatementType,
} from '@freedi/shared-types';
import { Response, Request, onInit, logger } from 'firebase-functions/v1';
import { parse } from 'valibot';
import { db } from '.';
import { GEMINI_MODEL } from './config/gemini';

interface SimpleDescendants {
	statement: string;
	statementId: string;
}
interface Group {
	groupName: string;
	statements: SimpleDescendants[];
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

export async function getCluster(req: Request, res: Response) {
	try {
		const statementId = req.body.statementId as Statement[];
		if (!statementId || typeof statementId !== 'string') {
			throw new Error('Invalid input: statementId is required');
		}

		const [topicDB, descendantsDB] = await Promise.all([
			db.collection(Collections.statements).doc(statementId).get(),
			db.collection(Collections.statements).where('parentId', '==', statementId).get(),
		]);
		const descendants = descendantsDB.docs
			.map((doc) => parse(StatementSchema, doc.data()))
			.filter((statement) => statement.isCluster !== true) as Statement[];

		const topic = topicDB.data() as Statement;

		if (!topic || !topic.statementId) {
			res.status(400).send({ error: 'Invalid input: topic is required', ok: false });

			return;
		}
		if (!statementId || typeof statementId !== 'string') {
			res.status(400).send({ error: 'Invalid input: statementId is required', ok: false });

			return;
		}

		if (!descendants || descendants.length === 0) {
			logger.log('No descendants found for the given statementId:', statementId);
			res.status(200).send({ message: 'No descendants found', descendants: [], ok: true });

			return;
		}

		const simpleDescendants: SimpleDescendants[] = descendants.map((descendant) => ({
			statement: descendant.statement,
			statementId: descendant.statementId,
		}));

		const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = `
        Hi Gemini! I need your help to cluster some statements based on their relevance to a main topic.
        The following statements are ideas suggested under this topic: ${topic.statement}.

        Your task:
        1. Cluster these statements primarily based on their relevance and relationship to the main topic "${topic.statement}".
        2. Statements that address similar aspects of the main topic should be grouped together.
        3. Within each relevance-based cluster, identify and consolidate similar statements:
        - When statements express the same concept with minor variations (like "לטייל ברגל", "טיול רגלי", and "טיול רגלי"), merge them into the most appropriate version.
        - Choose the clearest and most grammatically correct version (e.g., "טיול רגלי" over variations like "לטייל ברגל" or "טיל רגלי").
        - When you integrate or merge multiple similar statements, use the statementId of the best statement (the one with the clearest expression or most grammatically correct version).
        4. Name each group based on how its statements relate to the main topic, using the primary language of the statements.

        Return your response as a JSON array of cluster objects with this structure:
        [{
        groupName: "תיאור הקבוצה (באופן שמתייחס לנושא המרכזי)",
        statements: [
            {statement: "משפט נבחר 1", statementId: "id1"},
            {statement: "משפט נבחר 2", statementId: "id2"}
        ]
        }]

        The statements to analyze are: ${JSON.stringify(simpleDescendants)}
        `;
		const response = await model.generateContent(prompt);
		if (!response) {
			throw new Error('Error generating response from model');
		}
		const result = response.response;
		const text = result.text();

		const groups = convertStringToJson(text);
		if (!groups || !Array.isArray(groups)) {
			throw new Error('Error parsing response: expected an array of groups');
		}

		//save snapshot to firestore
		const snapshot: StatementSnapShot = {
			topic: topic,
			descendants: descendants,
			clusters: [],
			createdAt: new Date().getTime(),
		};

		//update data-base
		const batch = db.batch();

		//create new statements based on the groups:
		groups.forEach((group: Group) => {
			const id = getRandomUID();
			const groupRef = db.collection(Collections.statements).doc(id);
			snapshot.clusters.push(id);

			const newStatement: Statement = {
				statement: group.groupName,
				isCluster: true,
				statementId: id,
				parentId: topic.statementId,
				parents: [...(topic.parents || []), topic.statementId],
				topParentId: topic.topParentId,
				statementType: StatementType.option,
				createdAt: new Date().getTime(),
				creator: topic.creator,
				creatorId: topic.creatorId,
				consensus: 0,
				randomSeed: Math.random(),
				lastUpdate: new Date().getTime(),
			};
			batch.set(groupRef, newStatement);
			group.statements.forEach((statement: SimpleDescendants) => {
				const statementRef = db.collection(Collections.statements).doc(statement.statementId);
				batch.update(statementRef, {
					parentId: id,
					parents: [...(topic.parents || []), topic.statementId],
				});
			});
		});

		await batch.commit();
		logger.log('Batch write completed successfully');

		const snapshotsRef = db.collection(Collections.statementSnapShots);
		const newSnapshot = await snapshotsRef.add(snapshot);
		logger.log('Snapshot saved successfully:', snapshot.topic.statementId, newSnapshot.id);

		res.status(200).send({ text, descendants, ok: true, groups });
	} catch (error) {
		res
			.status(500)
			.send({ error: error instanceof Error ? error.message : 'Unknown server error', ok: false });
	}
}

function convertStringToJson(input: string): Group[] | null {
	try {
		// Check if the string starts with ```json and ends with ```
		let jsonString = input.replace(/```json/g, '');
		jsonString = jsonString.replace(/```/g, '');
		jsonString = jsonString.replace(/^>\s*/gm, '');

		const jsonArray = JSON.parse(jsonString);

		// Parse the cleaned JSON string into an object
		return jsonArray as Group[];
	} catch (error) {
		// Handle any parsing errors
		console.error('Error parsing JSON string:', error);
		throw new Error('Invalid JSON string provided');
		// Return an empty array in case of error
	}
}

export const recoverLastSnapshot = async (req: Request, res: Response) => {
	try {
		const { snapshotId } = req.body;
		if (!snapshotId || typeof snapshotId !== 'string') {
			throw new Error('Invalid input: snapshotId is required');
		}

		const snapshotsRef = db.collection(Collections.statementSnapShots);
		const snapshotDoc = await snapshotsRef
			.where('topic.statementId', '==', snapshotId)
			.orderBy('createdAt', 'desc')
			.limit(1)
			.get();

		if (snapshotDoc.empty) {
			throw new Error('Snapshot not found');
		}

		const snapshotData = snapshotDoc.docs[0].data() as StatementSnapShot;

		//recover the snapshot data
		const batch = db.batch();
		const clustersDB = await db
			.collection(Collections.statements)
			.where('parentId', '==', snapshotData.topic.statementId)
			.where('isCluster', '==', true)
			.get();
		const clustersIds = clustersDB.docs.map((doc) => doc.id as string);
		const descendants = snapshotData.descendants;

		descendants.forEach((statement) => {
			const statementRef = db.collection(Collections.statements).doc(statement.statementId);
			batch.update(statementRef, {
				parentId: snapshotData.topic.statementId,
				parents: [...(snapshotData.topic.parents || []), snapshotData.topic.statementId],
				topParentId: snapshotData.topic.topParentId,
			});
		});

		clustersIds.forEach((clusterId) => {
			const clusterRef = db.collection(Collections.statements).doc(clusterId);
			batch.delete(clusterRef);
		});

		await batch.commit();
		logger.log('Batch write restore successfully for snapshot:', snapshotData.topic.statementId);

		res.status(200).send({ snapshotData, ok: true });
	} catch (error) {
		res
			.status(500)
			.send({ error: error instanceof Error ? error.message : 'Unknown server error', ok: false });
	}
};
