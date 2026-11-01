import { useState } from 'react';
import {
	clearAllRoomsForParent,
	OptionWithMembers,
	splitJoinedOption,
} from '@/controllers/db/joining/splitJoinedOption';
import { logError } from '@/utils/errorHandling';

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
		if (options.length === 0) return;
		setIsSplitting(true);
		setHasFailed(false);
		setResult(null);
		try {
			await clearAllRoomsForParent(questionId);
			const summary: RoomSplitSummary = { rooms: 0, participants: 0 };
			const byJoined = [...options].sort((a, b) => b.joinedCount - a.joinedCount);
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
