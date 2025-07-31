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
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';

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
		let isRemovingVote = false;
		if (
			voteDoc.exists() &&
			voteDoc.data()?.statementId === option.statementId
		) {
			vote.statementId = 'none';
			isRemovingVote = true;
		}
		const parsedVote = parse(VoteSchema, vote);
		await setDoc(voteRef, parsedVote, { merge: true });
		
		// Track vote
		if (!isRemovingVote) {
			logger.info('Vote cast', { 
				statementId: option.statementId, 
				parentId: option.parentId,
				userId: creator.uid 
			});
			
			analyticsService.trackStatementVote(
				option.statementId, 
				1, // Vote value (1 for voting for this option)
				'button' // Default to button, could be passed as parameter
			);
		} else {
			logger.info('Vote removed', { 
				statementId: option.statementId, 
				parentId: option.parentId,
				userId: creator.uid 
			});
		}
	} catch (error) {
		logger.error('Failed to set vote', error, {
			statementId: option.statementId,
			userId: creator.uid
		});
	}
}
