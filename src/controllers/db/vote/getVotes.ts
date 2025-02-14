import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { getUserFromFirebase } from '../users/usersGeneral';
import { store } from '@/redux/store';
import { Collections } from '@/types/TypeEnums';
import { Statement, StatementSchema } from '@/types/statement/Statement';
import { getVoteId, Vote, VoteSchema } from '@/types/vote';
import { parse } from 'valibot';

// Why get user from firebase when we can pass it as a parameter?
export async function getToVoteOnParent(
	parentId: string | undefined,
	updateStoreWithVoteCB: (statement: Statement) => void
): Promise<void> {
	try {
		if (!parentId) throw new Error('ParentId not provided');

		const user = getUserFromFirebase();
		if (!user) throw new Error('User not logged in');
		if (!parentId) throw new Error('ParentId not provided');
		const voteId = getVoteId(user.uid, parentId);
		if (!voteId) throw new Error('VoteId not found');

		const parentVoteRef = doc(FireStore, Collections.votes, voteId);

		const voteDB = await getDoc(parentVoteRef);

		const vote = parse(VoteSchema, voteDB.data());

		//get statement to update to store
		const statementRef = doc(
			FireStore,
			Collections.statements,
			vote.statementId
		);
		const statementDB = await getDoc(statementRef);

		const statement = parse(StatementSchema, statementDB.data());

		updateStoreWithVoteCB(statement);
	} catch (error) {
		console.error(error);
	}
}

export async function getVoters(parentId: string): Promise<Vote[]> {
	try {
		const user = store.getState().user.user;
		if (!user) throw new Error('User not logged in');
		const votesRef = collection(FireStore, Collections.votes);
		const q = query(votesRef, where('parentId', '==', parentId));

		const votersDB = await getDocs(q);
		const voters = votersDB.docs.map((vote) =>
			parse(VoteSchema, vote.data())
		);

		return voters;
	} catch (error) {
		console.error(error);

		return [] as Vote[];
	}
}
