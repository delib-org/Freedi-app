import { db } from '.';
import { Query } from 'firebase-admin/firestore';
import {
	Collections,
	DeliberativeElement,
	StatementType,
} from '../../src/types/TypeEnums';
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

		if (!parentId) {
			res.status(400).send({ error: 'parentId is required', ok: false });

			return;
		}

		const allSolutionStatementsRef = db.collection(Collections.statements);

		const q: Query = allSolutionStatementsRef
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.orderBy('evaluation.viewed', 'asc')
			.orderBy('evaluation.evaluationRandomNumber', 'desc')
			.limit(limit);

		const randomStatementsDB = await q.get();

		const randomStatements = randomStatementsDB.docs.map((doc) =>
			doc.data()
		);

		//update number of viewed
		const batch = db.batch();
		randomStatementsDB.docs.forEach((doc) => {
			const ref = allSolutionStatementsRef.doc(doc.id);
			const data = doc.data();
			batch.update(ref, {
				'evaluation.viewed': data.evaluation.viewed + 1,
				'evaluation.evaluationRandomNumber': Math.random(),
			});
		});
		await batch.commit();

		//TODO: change the random number of each statement

		res.status(200).send({ statements: randomStatements, ok: true });
	} catch (error: unknown) {
		res.status(500).send({ error: (error as Error).message, ok: false });

		return;
	}
	// })
};

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
