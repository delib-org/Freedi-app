import { db } from '.';
import { logger, Request, Response } from 'firebase-functions/v1';
import { Collections } from 'delib-npm';
import { Creator } from '../../src/types/user/User';

export const getInitialMCData = async (req: Request, res: Response) => {
	try {
		const statementId = req.query.statementId as string;

		if (!statementId?.trim()) {
			res.status(400).send({
				error: 'statementId is required',
				ok: false,
			});
			logger.error('statementId is required', { statementId });

			return;
		}

		const statementDB = await db
			.collection(Collections.statements)
			.doc(statementId)
			.get();

		const statement = statementDB.data();
		if (!statement) {
			res.status(400).send({ error: 'statement not found', ok: false });
			logger.error('Statement not found', { statementId });

			return;
		}

		res.send({ statement, ok: true });
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error occurred';
		res.status(500).send({ error: errorMessage, ok: false });
		logger.error(errorMessage, { statementId: req.query.statementId });

		return;
	}
};

interface MassConsensusMember {
	statementId: string;
	lastUpdate: number;
	email: string;
	creator: Creator;
  } //TODO: add to types

  export const addMassConsensusMember = async (req: Request, res: Response) => {
	try {
	  const { statementId, lastUpdate, email, creator }: MassConsensusMember = req.body;
		
	  if (!statementId?.trim() || !email?.trim() || !lastUpdate || !creator) {
		res.status(400).send({ error: 'Missing required fields', ok: false });
		
		return;
	  }
  
	  const newMember: MassConsensusMember = {
		statementId,
		lastUpdate,
		email,
		creator,
	  };
	  await db.collection("massConsensusMembers" /* TODO: add to collections */).doc(creator.uid).set(newMember);
  
	  res.send({ message: 'Member added successfully', ok: true });
	} catch (error) {
	  const errorMessage =
		error instanceof Error ? error.message : 'Unknown error occurred';
		console.error(error);
	  res.status(500).send({ error: errorMessage, ok: false });
	}
  };