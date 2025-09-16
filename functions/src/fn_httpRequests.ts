import { db } from '.';
import { Query } from 'firebase-admin/firestore';
import {
	Collections,
	DeliberativeElement,
	StatementType,
} from 'delib-npm';
import { Request, Response } from 'firebase-functions/v1';

export const getUserOptions = async (req: Request, res: Response) => {
	// cors(req, res, async () => {
	try {
		const userId = req.query.userId;
		const parentId = req.query.parentId;
		if (!parentId) {
			res.status(400).send({ error: 'parentId is required', ok: false });

			return;
		}
		if (!userId) {
			res.status(400).send({ error: 'userId is required', ok: false });

			return;
		}

		const userOptionsRef = db
			.collection(Collections.statements)
			.where('creatorId', '==', userId)
			.where('parentId', '==', parentId)
			.where('statementType', 'in', ['result', 'option']);
		const userOptionsDB = await userOptionsRef.get();
		const statements = userOptionsDB.docs.map((doc) => doc.data());

		res.send({ statements, ok: true });

		return;
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
};

export const getRandomStatements = async (req: Request, res: Response) => {
	try {
		const parentId = req.query.parentId;

		let limit = Number(req.query.limit) || (6 as number);
		if (limit > 50) limit = 50;

		if (!parentId) {
			res.status(400).send({ error: 'parentId is required', ok: false });
			return;
		}

		// Get parent statement to check if anchored evaluation is enabled
		const parentDoc = await db.collection(Collections.statements).doc(parentId as string).get();
		const parentStatement = parentDoc.data();

		let statements = [];
		const allSolutionStatementsRef = db.collection(Collections.statements);

		if (parentStatement?.evaluationSettings?.anchored?.anchored) {
			const numberOfAnchoredStatements = parentStatement.evaluationSettings.anchored.numberOfAnchoredStatements || 3;

			// Step 1: Get all anchored statements from pool
			const anchoredQuery = allSolutionStatementsRef
				.where('parentId', '==', parentId)
				.where('statementType', '==', StatementType.option)
				.where('anchored', '==', true);

			const anchoredDocs = await anchoredQuery.get();
			const anchoredPool = anchoredDocs.docs.map(doc => doc.data());

			// Step 2: Randomly select N anchored statements from the pool
			const selectedAnchored = getRandomSample(anchoredPool, Math.min(numberOfAnchoredStatements, anchoredPool.length));

			// Step 3: Get random non-anchored statements to fill remaining slots
			const remainingSlots = Math.max(0, limit - selectedAnchored.length);

			if (remainingSlots > 0) {
				// Query for non-anchored options using the same distribution mechanism
				// Use 'in' query to get both false and undefined/null anchored values
				const nonAnchoredQuery: Query = allSolutionStatementsRef
					.where('parentId', '==', parentId)
					.where('statementType', '==', StatementType.option)
					.where('anchored', 'in', [false, null])
					.orderBy('evaluation.viewed', 'asc')
					.orderBy('evaluation.evaluationRandomNumber', 'desc')
					.limit(remainingSlots);

				const nonAnchoredDocs = await nonAnchoredQuery.get();
				let randomStatements = nonAnchoredDocs.docs.map(doc => doc.data());

				// If we didn't get enough (because most documents don't have anchored field at all)
				// Fall back to getting all options and filtering
				if (randomStatements.length < remainingSlots) {
					const allOptionsQuery: Query = allSolutionStatementsRef
						.where('parentId', '==', parentId)
						.where('statementType', '==', StatementType.option)
						.orderBy('evaluation.viewed', 'asc')
						.orderBy('evaluation.evaluationRandomNumber', 'desc')
						.limit(remainingSlots + anchoredPool.length);

					const allOptionsDocs = await allOptionsQuery.get();
					// Filter to exclude anchored statements
					const additionalStatements = allOptionsDocs.docs
						.map(doc => doc.data())
						.filter(statement => statement.anchored !== true)
						.slice(0, remainingSlots - randomStatements.length);

					randomStatements = [...randomStatements, ...additionalStatements];
				}

				// Step 4: Combine anchored and random statements
				statements = [...selectedAnchored, ...randomStatements];
			} else {
				statements = selectedAnchored;
			}

			// Step 5: Shuffle all statements together before sending
			console.info('Selected anchored count:', selectedAnchored.length);
			console.info('Random non-anchored count:', statements.length - selectedAnchored.length);
			console.info('Before shuffle - first 3:', statements.slice(0, 3).map(s => ({
				text: (s.statement || s.title || '').substring(0, 30),
				anchored: s.anchored
			})));

			statements = shuffleArray(statements);

			console.info('After shuffle - first 3:', statements.slice(0, 3).map(s => ({
				text: (s.statement || s.title || '').substring(0, 30),
				anchored: s.anchored
			})));
			console.info('After shuffle - all anchored flags:', statements.map(s => s.anchored));

		} else {
			// Standard random selection (existing logic)
			const q: Query = allSolutionStatementsRef
				.where('parentId', '==', parentId)
				.where('statementType', '==', StatementType.option)
				.orderBy('evaluation.viewed', 'asc')
				.orderBy('evaluation.evaluationRandomNumber', 'desc')
				.limit(limit);

			const randomStatementsDB = await q.get();
			statements = randomStatementsDB.docs.map((doc) => doc.data());
		}

		// Update view counts for all selected statements
		const batch = db.batch();
		statements.forEach((statement: any) => {
			const ref = allSolutionStatementsRef.doc(statement.statementId);
			batch.update(ref, {
				'evaluation.viewed': (statement.evaluation?.viewed || 0) + 1,
				'evaluation.evaluationRandomNumber': Math.random(),
			});
		});
		await batch.commit();

		// Final check before sending
		console.info('FINAL CHECK - statements order:', statements.map((s: any) => ({
			text: (s.statement || s.title || '').substring(0, 20),
			anchored: s.anchored
		})));

		res.status(200).send({ statements, ok: true });
	} catch (error: unknown) {
		res.status(500).send({ error: (error as Error).message, ok: false });
		return;
	}
};

// Helper function to shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
	// Create a deep copy to ensure we're not mutating the original
	const shuffled = [...array];

	// Fisher-Yates shuffle algorithm
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		// Swap elements
		const temp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = temp;
	}

	return shuffled;
}

// Helper function to randomly sample from array
function getRandomSample<T>(array: T[], size: number): T[] {
	// Use Fisher-Yates for proper randomization
	const shuffled = shuffleArray(array);

	return shuffled.slice(0, size);
}

export const getTopStatements = async (req: Request, res: Response) => {
	// cors(req, res, async () => {
	try {
		const parentId = req.query.parentId;
		let limit = Number(req.query.limit) || (6 as number);
		if (limit > 50) limit = 50;

		if (!parentId) {
			res.status(400).send({ error: 'parentId is required', ok: false });

			return;
		}

		const topSolutionsRef = db.collection(Collections.statements);
		const q: Query = topSolutionsRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.orderBy('consensus', 'desc')
			.limit(limit);
		const topSolutionsDB = await q.get();
		const statements = topSolutionsDB.docs.map((doc) => doc.data());

		res.send({ statements, ok: true });

		return;
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
	// })
};

export async function maintainRole(_: Request, res: Response) {
	try {
		const subscriptionsRef = db.collection(Collections.statementsSubscribe);
		const q = subscriptionsRef.where('role', '==', 'statement-creator');
		const subscriptionsDB = await q.get();
		//update the role statement-creator to admin
		const batch = db.batch();
		subscriptionsDB.docs.forEach((doc) => {
			const ref = subscriptionsRef.doc(doc.id);
			batch.update(ref, { role: 'admin' });
		});
		await batch.commit();
		res.send({ ok: true });
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
}

export async function maintainDeliberativeElement(_: Request, res: Response) {
	try {
		const statementsRef = db.collection(Collections.statements);
		const q = statementsRef.where('statementType', '!=', 'aa');
		const statementsDB = await q.get();

		//update statementType to deliberativeElements
		const batch = db.batch();
		statementsDB.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			if (doc.data().statementType === 'option') {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.option,
				});
			} else if (doc.data().statementType === 'result') {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.option,
					isResult: true,
				});
			} else if (doc.data().statementType === StatementType.question) {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.research,
				});
			} else {
				batch.update(ref, {
					deliberativeElement: DeliberativeElement.general,
				});
			}
		});

		await batch.commit();
		res.send({ ok: true });
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
}

export async function maintainStatement(_: Request, res: Response) {
	try {
		const statementsRef = db.collection(Collections.statements);
		const q = statementsRef.where(
			'resultsSettings.resultsBy',
			'!=',
			'topOptions'
		);
		const statementsDB = await q.get();

		//update statementType to deliberativeElements
		const batch = db.batch();
		statementsDB.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			batch.update(ref, { 'resultsSettings.resultsBy': 'topOptions' });
		});

		const subRef = db.collection(Collections.statements);
		const q2 = subRef.where('statement.results', '!=', []);
		const subsDB = await q2.get();

		//update statementType to deliberativeElements
		let count = 0;
		subsDB.docs.forEach((doc) => {
			const ref = statementsRef.doc(doc.id);
			batch.update(ref, { 'statement.results': [] });
			count++;
		});

		await batch.commit();
		res.send({ ok: true, count });
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
}

export async function maintainSubscriptionToken(_: Request, res: Response) {
	try {
		const subscriptionRef = db.collection(Collections.statementsSubscribe);

		const subscriptionsDB = await subscriptionRef.get();
		const batch = db.batch();
		let count = 0;
		subscriptionsDB.docs.forEach((doc) => {
			const ref = subscriptionRef.doc(doc.id);
			if (typeof doc.data().token === 'string') {
				count++;
				batch.update(ref, { token: [doc.data().token] });
			}
		});
		await batch.commit();
		res.send({ ok: true, size: subscriptionsDB.size, changed: count });
	} catch (error) {
		res.status(500).send({ error: error, ok: false });

		return;
	}
}
