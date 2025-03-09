import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import {
	Collections,
	Statement,
	getVoteId,
	Vote,
	VoteSchema,
	User,
} from 'delib-npm';
import { parse } from 'valibot';

export async function setVoteToDB(option: Statement, creator: User) {
	try {
		//vote reference
		const voteId = getVoteId(creator.uid, option.parentId);

		const voteRef = doc(FireStore, Collections.votes, voteId);

		// toggle vote
		const vote: Vote = {
			voteId,
			statementId: option.statementId,
			parentId: option.parentId,
			userId: creator.uid,
			lastUpdate: Timestamp.now().toMillis(),
			createdAt: Timestamp.now().toMillis(),
			voter: creator,
		};

		const voteDoc = await getDoc(voteRef);
		if (
			voteDoc.exists() &&
			voteDoc.data()?.statementId === option.statementId
		) {
			vote.statementId = 'none';
		}
		const parsedVote = parse(VoteSchema, vote);
		await setDoc(voteRef, parsedVote, { merge: true });
	} catch (error) {
		console.error(error);
	}
}
