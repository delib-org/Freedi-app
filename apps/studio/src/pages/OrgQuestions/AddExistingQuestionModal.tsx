import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { StatementType, type Statement } from '@freedi/shared-types';
import { Button, EmptyState, Input, Skeleton } from '@/components/atomic/atoms';
import { Tag } from '@/components/atomic/atoms/Tag';
import { lookupQuestion, useLinkableQuestions, type LinkableQuestion } from '@/db/orgActivities';
import { linkOrgStatement } from '@/db/orgFunctions';
import { parseQuestionRef, type QuestionRef } from '@/utils/questionRef';
import { callableMessage } from '../_shared/callableErrors';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './OrgQuestions.module.scss';

interface AddExistingQuestionModalProps {
	organizationId: string;
	userId: string;
	/** Questions already on this board — owned or linked — hidden from the list. */
	alreadyOnBoard: ReadonlySet<string>;
	onClose: () => void;
	onLinked: (statementId: string) => void;
}

/** How many matches to render before asking the consultant to narrow the search. */
const MAX_ROWS = 40;

/**
 * What the consultant has picked: either a row from their own questions, or
 * something a pasted id or link resolved to. A survey carries no title —
 * clients cannot read the surveys collection — so it is shown for what it is
 * and resolved to a question by the server.
 */
type Choice =
	| { kind: 'statement'; statementId: string; title: string }
	| { kind: 'survey'; surveyId: string };

function choiceKey(choice: Choice): string {
	return choice.kind === 'survey' ? choice.surveyId : choice.statementId;
}

/**
 * Adds a question or survey that already exists to this organization's board.
 *
 * The list is the consultant's own questions. The same box also takes an id or
 * a pasted link from any of the apps, which is how you reach a question a
 * colleague in this organization set up, or one nested under theirs — the
 * server decides whether the organization may have it.
 */
export default function AddExistingQuestionModal({
	organizationId,
	userId,
	alreadyOnBoard,
	onClose,
	onLinked,
}: AddExistingQuestionModalProps) {
	const { t, tWithParams } = useTranslation();
	const searchRef = useRef<HTMLDivElement>(null);
	const [search, setSearch] = useState('');
	const [choice, setChoice] = useState<Choice | null>(null);
	const [label, setLabel] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const [lookingUp, setLookingUp] = useState(false);
	const [found, setFound] = useState<Statement | null>(null);
	const [notFound, setNotFound] = useState(false);

	const { data: candidates, loading } = useLinkableQuestions(userId);

	const available = useMemo(
		() => candidates.filter((question) => !alreadyOnBoard.has(question.statementId)),
		[candidates, alreadyOnBoard],
	);
	const filtered = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return available;

		return available.filter((question) => question.title.toLowerCase().includes(needle));
	}, [available, search]);
	const shown = filtered.slice(0, MAX_ROWS);
	const hiddenCount = filtered.length - shown.length;

	// An id or link in the box is looked up as well as filtered on, so a
	// question the consultant does not own still has a row to click.
	const pastedRef = useMemo<QuestionRef | null>(() => parseQuestionRef(search), [search]);
	const pastedIsListed =
		pastedRef?.kind === 'statement' &&
		available.some((question) => question.statementId === pastedRef.id);

	useEffect(() => {
		setFound(null);
		setNotFound(false);
		if (!pastedRef || pastedRef.kind !== 'statement' || pastedIsListed) return;

		let cancelled = false;
		setLookingUp(true);
		lookupQuestion(pastedRef.id)
			.then((statement) => {
				if (cancelled) return;
				if (statement && statement.statementType === StatementType.question) {
					setFound(statement);
				} else {
					setNotFound(true);
				}
			})
			.catch((err) => {
				if (cancelled) return;
				logError(err, { operation: 'AddExistingQuestionModal.lookup', statementId: pastedRef.id });
				setNotFound(true);
			})
			.finally(() => {
				if (!cancelled) setLookingUp(false);
			});

		return () => {
			cancelled = true;
		};
	}, [pastedRef, pastedIsListed]);

	const alreadyAdded = pastedRef?.kind === 'statement' && alreadyOnBoard.has(pastedRef.id);

	const chooseFromList = (question: LinkableQuestion) => {
		setChoice({ kind: 'statement', statementId: question.statementId, title: question.title });
		setLabel(question.title);
		setError('');
	};

	const chooseFound = (statement: Statement) => {
		setChoice({
			kind: 'statement',
			statementId: statement.statementId,
			title: statement.statement,
		});
		setLabel(statement.statement);
		setError('');
	};

	const chooseSurvey = (surveyId: string) => {
		setChoice({ kind: 'survey', surveyId });
		setLabel('');
		setError('');
	};

	const handleAdd = async () => {
		if (!choice || submitting) return;
		setSubmitting(true);
		setError('');
		try {
			const trimmed = label.trim();
			// Same as the question's own title → no board name worth storing.
			const boardName =
				choice.kind === 'statement' && trimmed === choice.title ? undefined : trimmed || undefined;
			const { statementId } = await linkOrgStatement({
				organizationId,
				...(choice.kind === 'survey'
					? { surveyId: choice.surveyId }
					: { statementId: choice.statementId }),
				label: boardName,
			});
			onLinked(statementId);
		} catch (err) {
			logError(err, {
				operation: 'AddExistingQuestionModal.link',
				organizationId,
				metadata: { ref: choiceKey(choice) },
			});
			setError(callableMessage(err, t('Could not add the question. Please try again.')));
			setSubmitting(false);
		}
	};

	const selectedKey = choice ? choiceKey(choice) : null;

	const rowClass = (isSelected: boolean) =>
		isSelected ? `${styles.pickerRow} ${styles.pickerRowSelected}` : styles.pickerRow;

	return (
		<SimpleModal
			title={t('Add an existing question')}
			onClose={onClose}
			busy={submitting}
			size="medium"
			initialFocusRef={searchRef}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" disabled={submitting} onClick={onClose} />
					<Button
						text={t('Add to organization')}
						variant="primary"
						disabled={!choice || submitting}
						loading={submitting}
						onClick={handleAdd}
					/>
				</>
			}
		>
			<div className={styles.form}>
				<div ref={searchRef} tabIndex={-1} className={styles.field}>
					<Input
						label={t('Find a question, or paste a link or ID')}
						value={search}
						onChange={setSearch}
						placeholder={t('Search, or paste a link from any Freedi app')}
						fullWidth
						autoFocus
						disabled={submitting}
					/>
				</div>

				{/* ---- what a pasted id or link resolved to ---- */}

				{alreadyAdded && (
					<p className={styles.pickerHint} role="status">
						{t('That question is already on this board.')}
					</p>
				)}

				{pastedRef?.kind === 'survey' && !submitting && (
					<ul className={styles.pickerList} aria-label={t('Pasted reference')}>
						<li>
							<button
								type="button"
								className={rowClass(selectedKey === pastedRef.id)}
								onClick={() => chooseSurvey(pastedRef.id)}
							>
								<span className={styles.pickerTitle}>{t('Crowd survey')}</span>
								<Tag outline>{t('By link')}</Tag>
							</button>
						</li>
						<li className={styles.pickerHint}>
							{t('The question this survey is built around will be added.')}
						</li>
					</ul>
				)}

				{lookingUp && <Skeleton variant="text" />}

				{found && !alreadyAdded && (
					<ul className={styles.pickerList} aria-label={t('Pasted reference')}>
						<li>
							<button
								type="button"
								className={rowClass(selectedKey === found.statementId)}
								disabled={submitting}
								onClick={() => chooseFound(found)}
							>
								<span className={styles.pickerTitle} dir="auto">
									{found.statement.trim() || t('Untitled')}
								</span>
								<Tag outline>{t('By link')}</Tag>
							</button>
						</li>
					</ul>
				)}

				{notFound && (
					<p className={styles.pickerHint} role="status">
						{t('No question with that ID. Check the link and try again.')}
					</p>
				)}

				{/* ---- the consultant's own questions ---- */}

				{loading && (
					<div className={styles.pickerList}>
						<Skeleton variant="text" />
						<Skeleton variant="text" width="80%" />
						<Skeleton variant="text" width="60%" />
					</div>
				)}

				{!loading && available.length === 0 && !pastedRef && (
					<EmptyState
						icon="🔗"
						title={t('Nothing to add')}
						text={t(
							'Questions you administer will appear here, ready to add to this organization.',
						)}
						compact
					/>
				)}

				{!loading && available.length > 0 && filtered.length === 0 && !pastedRef && (
					<EmptyState icon="🔍" title={t('No question matches that search.')} compact />
				)}

				{shown.length > 0 && (
					<ul className={styles.pickerList} role="listbox" aria-label={t('Your questions')}>
						{shown.map((question) => {
							const isSelected = selectedKey === question.statementId;

							return (
								<li key={question.statementId}>
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										className={rowClass(isSelected)}
										disabled={submitting}
										onClick={() => chooseFromList(question)}
									>
										<span className={styles.pickerTitle} dir="auto">
											{question.title.trim() || t('Untitled')}
										</span>
										{!question.isTopLevel && <Tag outline>{t('Activity')}</Tag>}
									</button>
								</li>
							);
						})}
					</ul>
				)}

				{hiddenCount > 0 && (
					<p className={styles.pickerHint}>
						{tWithParams('{{count}} more — narrow the search to see them.', {
							count: hiddenCount,
						})}
					</p>
				)}

				{choice && (
					<Input
						label={t('Name it on this board')}
						value={label}
						onChange={setLabel}
						placeholder={choice.kind === 'survey' ? t("The survey's own title") : undefined}
						helperText={t('Only this organization sees this name. Participants keep the original.')}
						fullWidth
						disabled={submitting}
					/>
				)}

				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
			</div>
		</SimpleModal>
	);
}
