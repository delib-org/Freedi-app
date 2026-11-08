import { useState } from 'react';
import {
	clearAllRoomsForParent,
	OptionWithMembers,
	splitJoinedOption,
} from '@/controllers/db/joining/splitJoinedOption';
import { logError } from '@/utils/errorHandling';
import { JOINING } from '@/constants/common';

interface RoomSplitInput {
	questionId: string;
	options: OptionWithMembers[];
	roomSize: number;
	scrambleByQuestions: string[];
	onSplit: () => Promise<void>;
}

export interface RoomSplitSummary {
	rooms: number;
	participants: number;
}

export interface RoomSplitState {
	isSplitting: boolean;
	hasFailed: boolean;
	result: RoomSplitSummary | null;
	run: () => Promise<void>;
}

/**
 * An answer needs two people to make a room (the server's own rule in
 * `splitJoinedOption`); a smaller-than-full answer gets one smaller room.
 * A lone person is left as they are, not counted as a failure.
 */
export function canSplitAnswer(option: OptionWithMembers): boolean {
	return option.joinedCount >= JOINING.MIN_ROOM_SIZE;
}

/**
 * Splits everyone who joined the question's answers into rooms: clears the
 * old rooms, then splits answer by answer (most joined first, so they get
 * the lowest room numbers).
 */
export function useRoomSplit({
	questionId,
	options,
	roomSize,
	scrambleByQuestions,
	onSplit,
}: RoomSplitInput): RoomSplitState {
	const [isSplitting, setIsSplitting] = useState(false);
	const [hasFailed, setHasFailed] = useState(false);
	const [result, setResult] = useState<RoomSplitSummary | null>(null);

	async function run(): Promise<void> {
		const eligible = options.filter(canSplitAnswer);
		if (eligible.length === 0) return;
		setIsSplitting(true);
		setHasFailed(false);
		setResult(null);
		try {
			await clearAllRoomsForParent(questionId);
			const summary: RoomSplitSummary = { rooms: 0, participants: 0 };
			const byJoined = [...eligible].sort((a, b) => b.joinedCount - a.joinedCount);
			for (const option of byJoined) {
				const split = await splitJoinedOption({
					optionStatementId: option.statementId,
					parentStatementId: questionId,
					roomSize,
					scrambleByQuestions,
				});
				summary.rooms += split.totalRooms;
				summary.participants += split.totalParticipants;
			}
			setResult(summary);
			await onSplit();
		} catch (error) {
			logError(error, {
				operation: 'OptionRooms.useRoomSplit.run',
				statementId: questionId,
				metadata: { answers: options.length, roomSize },
			});
			setHasFailed(true);
		} finally {
			setIsSplitting(false);
		}
	}

	return { isSplitting, hasFailed, result, run };
}
