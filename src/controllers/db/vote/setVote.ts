import { runTransaction } from 'firebase/firestore';
import { FireStore } from '../config';
import { Statement, getVoteId, Vote, VoteSchema, User } from '@freedi/shared-types';
import { parse } from 'valibot';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import { createDocRef, createTimestamps } from '@/utils/firebaseUtils';
import { Collections } from '@freedi/shared-types';

export async function setVoteToDB(option: Statement, creator: User) {
	try {
		//vote reference
		const voteId = getVoteId(creator.uid, option.parentId);

		const voteRef = createDocRef(Collections.votes, voteId);

		// toggle vote atomically using a transaction
		const isRemovingVote = await runTransaction(FireStore, async (transaction) => {
			const voteDoc = await transaction.get(voteRef);

			const { createdAt, lastUpdate } = createTimestamps();
			const vote: Vote = {
				voteId,
				statementId: option.statementId,
				parentId: option.parentId,
				userId: creator.uid,
				lastUpdate,
				createdAt,
				voter: creator,
			};

			let removing = false;
			if (voteDoc.exists() && voteDoc.data()?.statementId === option.statementId) {
				vote.statementId = 'none';
				removing = true;
			}

			const parsedVote = parse(VoteSchema, vote);
			transaction.set(voteRef, parsedVote, { merge: true });

			return removing;
		});

		// Track vote
		if (!isRemovingVote) {
			logger.info('Vote cast', {
				statementId: option.statementId,
				parentId: option.parentId,
				userId: creator.uid,
			});

			analyticsService.trackStatementVote(
				option.statementId,
				1, // Vote value (1 for voting for this option)
				'button', // Default to button, could be passed as parameter
			);
		} else {
			logger.info('Vote removed', {
				statementId: option.statementId,
				parentId: option.parentId,
				userId: creator.uid,
			});
		}
	} catch (error) {
		logger.error('Failed to set vote', error, {
			statementId: option.statementId,
			userId: creator.uid,
		});
	}
}
