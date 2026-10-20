import { useMemo, useRef, useState } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';
import { textToParagraphs } from '@/view/pages/statement/components/addStatement/useCreateStatementFlow';
import { logError } from '@/utils/errorHandling';
import { VALIDATION } from '@/constants/common';

export interface AskSpace {
	id: string;
	title: string;
	statement: Statement;
}

/** The value of the picker for a question that lives on its own (parent 'top'). */
export const NO_SPACE = 'top';
/** The value of the picker for "create a space first, then ask inside it". */
export const NEW_SPACE = '__new-space__';

export type AskError = 'generic' | 'partial' | null;

interface StatementsRoot {
	statements: { statements: Statement[] };
}

interface UseAskInSpaceOptions {
	spaces: AskSpace[];
	currentSpaceId?: string;
	onCreated: (questionId: string) => void;
}

/** The current space first, then the most recently updated. */
export function sortSpaces(spaces: AskSpace[], currentSpaceId?: string): AskSpace[] {
	return [...spaces].sort((a, b) => {
		if (a.id === currentSpaceId) return -1;
		if (b.id === currentSpaceId) return 1;

		return (b.statement.lastUpdate ?? 0) - (a.statement.lastUpdate ?? 0);
	});
}

function splitText(text: string): { title: string; description: string } {
	const [title, ...rest] = text.trim().split('\n');

	return { title: title ?? '', description: rest.join('\n').trim() };
}

/**
 * Asks a question, optionally inside a space — an existing one or a new one.
 * A new space is two writes in order: the group (parent 'top'), then the
 * question under the group as read back from the store. If the second write
 * fails the new space is kept and selected, so a retry writes only the question.
 */
export function useAskInSpace({ spaces, currentSpaceId, onCreated }: UseAskInSpaceOptions) {
	const dispatch = useDispatch();
	const store = useStore<StatementsRoot>();
	const { user } = useAuthentication();
	const { currentLanguage } = useUserConfig();
	const [choice, setChoice] = useState<string>(
		currentSpaceId && spaces.some((space) => space.id === currentSpaceId)
			? currentSpaceId
			: NO_SPACE,
	);
	const [text, setText] = useState('');
	const [spaceName, setSpaceName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<AskError>(null);
	const [createdSpace, setCreatedSpace] = useState<AskSpace | null>(null);
	const submittingRef = useRef(false);

	const options = useMemo(() => {
		const all =
			createdSpace && !spaces.some((s) => s.id === createdSpace.id)
				? [...spaces, createdSpace]
				: spaces;

		return sortSpaces(all, createdSpace?.id ?? currentSpaceId);
	}, [spaces, createdSpace, currentSpaceId]);

	const isNewSpace = choice === NEW_SPACE;
	const nameOk = !isNewSpace || spaceName.trim().length >= VALIDATION.MIN_TITLE_LENGTH;
	const textOk = text.trim().length >= VALIDATION.MIN_TITLE_LENGTH;
	const canSubmit = textOk && nameOk && !busy && !!user;

	function onServerWriteError(error: unknown, id: string): void {
		logError(error, {
			operation: 'askQuestion.useAskInSpace.serverWrite',
			statementId: id,
			userId: user?.uid,
		});
	}

	async function submit(): Promise<void> {
		if (!user || !canSubmit || submittingRef.current) return;
		submittingRef.current = true;
		setBusy(true);
		setError(null);
		let stage: 'space' | 'question' = 'question';
		let spaceCreatedNow = false;
		try {
			let parent: Statement | 'top' = 'top';
			if (isNewSpace) {
				stage = 'space';
				const spaceId = await createStatementWithSubscription({
					newStatementParent: 'top',
					title: spaceName.trim(),
					newStatement: { statementType: StatementType.group },
					newStatementQuestionType: getDefaultQuestionType(),
					currentLanguage,
					user,
					dispatch,
					onServerWriteError: (e: unknown) => onServerWriteError(e, 'new-space'),
				});
				const created = store
					.getState()
					.statements.statements.find((s) => s.statementId === spaceId);
				if (!created) throw new Error('The new space is not in the store');
				const space = { id: created.statementId, title: created.statement, statement: created };
				spaceCreatedNow = true;
				setCreatedSpace(space);
				setChoice(space.id);
				parent = created;
				stage = 'question';
			} else {
				parent = spaces.find((s) => s.id === choice)?.statement ?? createdSpace?.statement ?? 'top';
			}
			const { title, description } = splitText(text);
			const questionId = await createStatementWithSubscription({
				newStatementParent: parent,
				title,
				paragraphs: textToParagraphs(description),
				newStatement: { statementType: StatementType.question },
				newStatementQuestionType: getDefaultQuestionType(),
				currentLanguage,
				user,
				dispatch,
				onServerWriteError: (e: unknown) => onServerWriteError(e, 'new-question'),
			});
			onCreated(questionId);
		} catch (e) {
			logError(e, {
				operation: 'askQuestion.useAskInSpace.submit',
				userId: user.uid,
				metadata: { stage, newSpace: isNewSpace },
			});
			// Once the space exists, only the question is left to retry.
			const spaceExists = spaceCreatedNow || (!!createdSpace && choice === createdSpace.id);
			setError(stage === 'question' && spaceExists ? 'partial' : 'generic');
		} finally {
			submittingRef.current = false;
			setBusy(false);
		}
	}

	return {
		options,
		choice,
		setChoice,
		text,
		setText,
		spaceName,
		setSpaceName,
		isNewSpace,
		busy,
		error,
		canSubmit,
		submit,
	};
}
