import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserDemographicQuestion } from '@freedi/shared-types';
import { getUserDemographicResponses } from '@/controllers/db/userDemographic/getUserDemographic';
import { saveMemberValidationStatus } from '@/controllers/db/memberValidation/memberValidationStatus';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import type { MemberReviewData } from '@/types/demographics';

const OPERATION = 'people.useEntryCheck';

export type EntryStatus = MemberReviewData['status'];
export type EntryAction = 'approve' | 'flag' | 'ban';
export type EntryCounts = Record<EntryStatus | 'all', number>;

const STATUS_OF: Record<EntryAction, EntryStatus> = {
	approve: 'approved',
	flag: 'flagged',
	ban: 'banned',
};

export interface EntryCheckState {
	members: MemberReviewData[];
	counts: EntryCounts;
	isLoading: boolean;
	reload: () => Promise<void>;
	/** Saves one review decision; the counts and the list update in place. */
	decide: (userId: string, action: EntryAction, reason?: string) => Promise<void>;
}

export function countEntryStatuses(members: ReadonlyArray<MemberReviewData>): EntryCounts {
	const counts: EntryCounts = {
		all: members.length,
		pending: 0,
		flagged: 0,
		approved: 0,
		banned: 0,
	};
	members.forEach((member) => {
		counts[member.status] += 1;
	});

	return counts;
}

const NO_INHERITED: ReadonlyArray<UserDemographicQuestion> = [];

/**
 * Entry check (#entry-check): everyone who answered the questions on joining
 * — this space's own and the group questions it still asks (the same set
 * Questions on joining shows) — and where their review stands. Loads only
 * when the space has questions, so a space without them costs no reads.
 */
export function useEntryCheck(
	statementId: string,
	hasQuestions: boolean,
	inheritedQuestions: ReadonlyArray<UserDemographicQuestion> = NO_INHERITED,
): EntryCheckState {
	const reviewer = useAppSelector(creatorSelector);
	const [members, setMembers] = useState<MemberReviewData[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	// Reload when the set of questions changes, not on every new array.
	const inheritedKey = inheritedQuestions.map((q) => q.userQuestionId).join(',');
	const inheritedRef = useRef(inheritedQuestions);
	inheritedRef.current = inheritedQuestions;

	const reload = useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			setMembers(await getUserDemographicResponses(statementId, inheritedRef.current));
		} catch (error) {
			logError(error, {
				operation: `${OPERATION}.reload`,
				statementId,
				metadata: { inheritedQuestions: inheritedKey },
			});
		} finally {
			setIsLoading(false);
		}
	}, [statementId, inheritedKey]);

	useEffect(() => {
		if (hasQuestions) void reload();
		else setMembers([]);
	}, [hasQuestions, reload]);

	const decide = useCallback(
		async (userId: string, action: EntryAction, reason?: string): Promise<void> => {
			const status = STATUS_OF[action];
			try {
				await saveMemberValidationStatus(statementId, userId, status, reason, reviewer?.uid);
				setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, status } : m)));
			} catch (error) {
				logError(error, {
					operation: `${OPERATION}.decide`,
					statementId,
					userId,
					metadata: { action },
				});
			}
		},
		[statementId, reviewer?.uid],
	);

	const counts = useMemo(() => countEntryStatuses(members), [members]);

	return { members, counts, isLoading, reload, decide };
}
