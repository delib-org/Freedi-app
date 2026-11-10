import { collection, getDoc, getDocs, query, where } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections, getVoteId, Vote, VoteSchema } from '@freedi/shared-types';
import { parse } from 'valibot';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/** The person's stored vote on one question, or undefined when there is none. One document read. */
export async function getOwnVote(parentId: string, userId: string): Promise<Vote | undefined> {
	try {
		const voteDB = await getDoc(createDocRef(Collections.votes, getVoteId(userId, parentId)));
		if (!voteDB.exists()) return undefined;

		return parse(VoteSchema, voteDB.data());
	} catch (error) {
		logError(error, {
			operation: 'vote.getVotes.getOwnVote',
			userId,
			statementId: parentId,
		});

		return undefined;
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
		logError(error, { operation: 'vote.getVotes.voters' });

		return [] as Vote[];
	}
}
