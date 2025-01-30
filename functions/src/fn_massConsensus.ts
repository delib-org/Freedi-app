import { Collections } from "delib-npm";
import { db } from ".";
import { logger } from "firebase-functions/v1";

export const getInitialMCData = async (req: any, res: any) => {
	try {
		const statementId = req.query.statementId;
		console.log("statementId:", statementId);
		console.log("req.params:", req.params);
		if (!statementId) {
			res.status(400).send({ error: "statementId is required", ok: false });
			logger.error("statementId is required", { statementId });
			return;
		}

		const statementDB = await db.collection(Collections.statements).doc(statementId).get();
		const statement = statementDB.data();
		if (!statement) {
			res.status(400).send({ error: "statement not found", ok: false });
			logger.error("Statement not found", { statementId });
			return;
		}

		res.send({ statement, ok: true });
	} catch (error: any) {
		res.status(500).send({ error: error.message, ok: false });
		logger.error(error.message, { error });
		return;

	}
}