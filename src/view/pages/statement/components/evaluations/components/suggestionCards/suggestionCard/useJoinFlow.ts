import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { statementsSelector } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { getOwningQuestion } from '@/controllers/db/statements/getOwningQuestion';
import {
	hasJoinFormSubmission,
	saveJoinFormSubmission,
} from '@/controllers/db/joining/joinFormSubmissions';
import { JoinRole, toggleJoining, ToggleJoiningResult } from '@/controllers/db/joining/setJoining';
import { logError } from '@/utils/errorHandling';

interface UseJoinFlowArgs {
	option: Statement;
	parentStatement?: Statement;
}

interface StartJoinArgs {
	role: JoinRole;
}

interface UseJoinFlowResult {
	/** Whether the form modal should be open. */
	modalOpen: boolean;
	/** Close the modal without submitting. */
	closeModal: () => void;
	/** Triggered by the option card when the user clicks a join/leave button.
	 *  Either opens the form modal (first join) or toggles directly. */
	startJoin: (args: StartJoinArgs) => Promise<ToggleJoiningResult | undefined>;
	/** Called by the modal when the user submits valid values. */
	submitForm: (payload: {
		displayName: string;
		values: Record<string, string>;
	}) => Promise<ToggleJoiningResult | undefined>;
	/** Form fields currently in effect (from the owning question's settings). */
	fields: ReturnType<typeof getFields>;
	/** True if either the fetch or the toggle is in flight. */
	isLoading: boolean;
}

function getFields(owningQuestion: Statement | undefined) {
	return owningQuestion?.statementSettings?.joinForm?.fields ?? [];
}

/**
 * Orchestrates the two-step join flow:
 *  1. Resolve the nearest ancestor question for this option.
 *  2. If that question has `joinForm.enabled` AND the user has no submission
 *     yet, open a modal to collect the admin-defined fields first.
 *  3. Otherwise, toggle the join/leave immediately.
 *
 * The hook does not render anything — the card renders the buttons and the
 * modal and wires them to this state.
 */
export function useJoinFlow({ option, parentStatement }: UseJoinFlowArgs): UseJoinFlowResult {
	const statements = useSelector(statementsSelector);
	const creator = useSelector(creatorSelector);

	const [modalOpen, setModalOpen] = useState(false);
	const [pendingRole, setPendingRole] = useState<JoinRole | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	// Walk the ancestry to find the owning question. Fall back to
	// `parentStatement` if it's a question (common shallow case), since it
	// may not be in the Redux array yet.
	const owningQuestion =
		getOwningQuestion(option, statements) ??
		(parentStatement && parentStatement.statementType === StatementType.question
			? parentStatement
			: undefined);

	const fields = getFields(owningQuestion);
	const joinForm = owningQuestion?.statementSettings?.joinForm;
	const isFormGated = joinForm?.enabled === true && fields.length > 0;

	const runToggle = useCallback(
		async (role: JoinRole): Promise<ToggleJoiningResult | undefined> => {
			try {
				setIsLoading(true);
				const result = await toggleJoining({
					statementId: option.statementId,
					parentStatementId: parentStatement?.statementId,
					role,
				});

				return result;
			} catch (error) {
				logError(error, {
					operation: 'useJoinFlow.runToggle',
					statementId: option.statementId,
					metadata: { role },
				});

				return undefined;
			} finally {
				setIsLoading(false);
			}
		},
		[option.statementId, parentStatement?.statementId],
	);

	const startJoin = useCallback(
		async ({ role }: StartJoinArgs) => {
			// Leaving (already a member) always skips the form — no reason to re-ask.
			const alreadyMember =
				role === 'organizer'
					? option.organizers?.some((u) => u.uid === creator?.uid)
					: option.joined?.some((u) => u.uid === creator?.uid);
			if (alreadyMember) return runToggle(role);

			if (!isFormGated || !owningQuestion || !creator) {
				return runToggle(role);
			}

			setIsLoading(true);
			try {
				const already = await hasJoinFormSubmission(owningQuestion.statementId, creator.uid);
				if (already) {
					return await runToggle(role);
				}
			} finally {
				setIsLoading(false);
			}

			// No submission yet — defer the toggle until the modal submits.
			setPendingRole(role);
			setModalOpen(true);

			return undefined;
		},
		[creator, isFormGated, option.joined, option.organizers, owningQuestion, runToggle],
	);

	const submitForm = useCallback(
		async ({ displayName, values }: { displayName: string; values: Record<string, string> }) => {
			if (!owningQuestion || !creator || !pendingRole) return undefined;
			try {
				setIsLoading(true);
				await saveJoinFormSubmission({
					questionId: owningQuestion.statementId,
					userId: creator.uid,
					displayName: displayName || creator.displayName || '',
					values,
				});
				const result = await runToggle(pendingRole);
				setModalOpen(false);
				setPendingRole(null);

				return result;
			} catch (error) {
				logError(error, {
					operation: 'useJoinFlow.submitForm',
					statementId: owningQuestion.statementId,
					userId: creator.uid,
					metadata: { role: pendingRole },
				});

				return undefined;
			} finally {
				setIsLoading(false);
			}
		},
		[creator, owningQuestion, pendingRole, runToggle],
	);

	const closeModal = useCallback(() => {
		setModalOpen(false);
		setPendingRole(null);
	}, []);

	return {
		modalOpen,
		closeModal,
		startJoin,
		submitForm,
		fields,
		isLoading,
	};
}
