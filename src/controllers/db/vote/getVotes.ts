import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { FireStore } from '../config';
import {
	Collections,
	Statement,
	StatementSchema,
	getVoteId,
	Vote,
	VoteSchema,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { normalizeStatementData } from '@/helpers/timestampHelpers';

// Why get user from firebase when we can pass it as a parameter?
export async function getToVoteOnParent(
	parentId: string | undefined,
	userId: string,
	updateStoreWithVoteCB: (statement: Statement) => void,
): Promise<void> {
	try {
		if (!parentId) throw new Error('ParentId not provided');
		if (!parentId) throw new Error('ParentId not provided');

		const voteId = getVoteId(userId, parentId);
		if (!voteId) throw new Error('VoteId not found');

		const parentVoteRef = doc(FireStore, Collections.votes, voteId);
		const voteDB = await getDoc(parentVoteRef);

		if (!voteDB.exists()) return null;
		const vote = parse(VoteSchema, voteDB.data());

		const statementRef = doc(FireStore, Collections.statements, vote.statementId);
		const statementDB = await getDoc(statementRef);
		const statement = parse(StatementSchema, normalizeStatementData(statementDB.data()));

		updateStoreWithVoteCB(statement);
	} catch (error) {
		console.error(error);

		return null;
	}
}

export async function getVoters(parentId: string): Promise<Vote[]> {
	try {
		const votesRef = collection(FireStore, Collections.votes);
		const q = query(votesRef, where('parentId', '==', parentId));

		const votersDB = await getDocs(q);
		const voters = votersDB.docs.map((vote) => parse(VoteSchema, vote.data()));

		return voters;
	} catch (error) {
		console.error(error);

		return [] as Vote[];
	}
}
